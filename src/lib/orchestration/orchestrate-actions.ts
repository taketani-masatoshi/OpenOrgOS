import { handoffSchema } from "../../../schemas/routing.js";
import type { AiaRunRecord } from "../../../schemas/aia-runtime.js";
import type { WorkOrderDispatch } from "../../../schemas/routing.js";
import { loadAiaQueueFile } from "../aia/queue-store.js";
import { getSharedAiaScheduler, loadAiaRuntimeConfig } from "../aia/scheduler.js";
import { loadHandoff, writeHandoffFiles } from "../routing.js";
import {
  blockedByFailure,
  buildPlanGraph,
  readyWorkOrders,
  resolvePlanRoot,
  retryableFailedWorkOrders,
  syncDependencyStatuses,
} from "./plan-graph.js";
import { enrichHandoffDisplayFields, resolveWorkOrderTitle } from "./board-view.js";
import {
  completeWorkOrderViaState,
  getWorkOrderDispatch,
  reopenWorkOrderViaState,
  transitionWorkOrder,
  WORK_ORDER_CANCEL_BLOCK_REASON,
} from "./work-order-state.js";

export function retryFailedWorkOrders(id: string): string[] {
  const rootId = resolvePlanRoot(id);
  const graph = buildPlanGraph(rootId);
  const retryable = retryableFailedWorkOrders(graph);
  const retried: string[] = [];

  for (const node of retryable) {
    transitionWorkOrder(node.id, "pending", { skipQueueEvent: false });
    retried.push(node.id);
    graph.nodes.set(node.id, loadHandoff(node.id));
  }

  syncDependencyStatuses(buildPlanGraph(rootId));
  return retried;
}

export function cancelPendingWorkOrders(id: string): string[] {
  const rootId = resolvePlanRoot(id);
  const graph = buildPlanGraph(rootId);
  const cancelled: string[] = [];

  for (const node of graph.nodes.values()) {
    if (node.status !== "pending" && node.status !== "waiting") continue;
    transitionWorkOrder(node.id, "blocked", {
      error: WORK_ORDER_CANCEL_BLOCK_REASON,
      skipQueueEvent: true,
    });
    cancelled.push(node.id);
  }

  return cancelled;
}

export function completeWorkOrderRun(id: string, notes?: string): ReturnType<typeof completeWorkOrderViaState> {
  const rootId = resolvePlanRoot(id);
  const updated = completeWorkOrderViaState(id, notes);
  syncDependencyStatuses(buildPlanGraph(rootId));
  return updated;
}

export function reopenWorkOrderRun(id: string): ReturnType<typeof reopenWorkOrderViaState> {
  const rootId = resolvePlanRoot(id);
  const updated = reopenWorkOrderViaState(id);
  syncDependencyStatuses(buildPlanGraph(rootId));
  return updated;
}

export function applyDependsToWorkOrders(
  rootId: string,
  depends: Map<string, string[]>,
): void {
  for (const [childId, depIds] of depends.entries()) {
    const handoff = loadHandoff(childId);
    const updated = handoffSchema.parse({
      ...handoff,
      depends_on: depIds,
    });
    writeHandoffFiles(updated, undefined, { audit: false });
  }
  syncDependencyStatuses(buildPlanGraph(rootId));
}

function buildAiaRunLookup(runs: AiaRunRecord[]) {
  const byRunId = new Map<string, AiaRunRecord>();
  const byWorkOrderId = new Map<string, AiaRunRecord>();
  for (const run of runs) {
    byRunId.set(run.run_id, run);
    if (run.work_order_id) {
      byWorkOrderId.set(run.work_order_id, run);
    }
  }
  return { byRunId, byWorkOrderId };
}

function resolveAiaRunForNode(
  nodeId: string,
  dispatch: WorkOrderDispatch,
  lookup: ReturnType<typeof buildAiaRunLookup>,
): AiaRunRecord | undefined {
  if (dispatch.last_run_id) {
    const byId = lookup.byRunId.get(dispatch.last_run_id);
    if (byId) return byId;
  }
  return (
    lookup.byWorkOrderId.get(nodeId) ??
    lookup.byRunId.get(`RUN-${nodeId}`)
  );
}

function formatAiaState(run?: AiaRunRecord): string {
  if (!run) return "—";
  const reason = run.fail_reason ? ` · ${run.fail_reason.slice(0, 28)}` : "";
  return `${run.state}${reason}`;
}

export interface OrchestrationStatusPayload {
  rootId: string;
  planTitle: string;
  nodeCount: number;
  waveCount: number;
  readyCount: number;
  blockedByFailureCount: number;
  retryableCount: number;
  cancellableCount: number;
  aia: {
    tier: string;
    max_concurrent: number;
    running: number;
    queued: number;
  };
  nodes: Array<{
    id: string;
    title: string;
    column: string;
    agent: string;
    status: string;
    work_kind: string | null;
    due_date?: string;
    assignee?: string;
    blocked_on?: string;
    depends_on: string[];
    depends_on_labels: Array<{ id: string; title: string }>;
    dispatch: WorkOrderDispatch;
    wave: number;
    retryable: boolean;
    cancellable: boolean;
    aia?: {
      run_id: string;
      state: string;
      fail_reason?: string;
    };
  }>;
  aia_runs: Array<{
    run_id: string;
    work_order_id?: string;
    agent_id: string;
    state: string;
    fail_reason?: string;
  }>;
  blocked_downstream: Array<{ id: string; agent: string; status: string }>;
}

export function buildOrchestrationStatusPayload(id: string): OrchestrationStatusPayload {
  const rootId = resolvePlanRoot(id);
  const graph = buildPlanGraph(rootId);
  syncDependencyStatuses(graph);
  const ready = readyWorkOrders(graph);
  const blocked = blockedByFailure(graph);
  const retryable = retryableFailedWorkOrders(graph);
  const cancellableCount = [...graph.nodes.values()].filter(
    (node) => node.status === "pending" || node.status === "waiting",
  ).length;
  const aiaConfig = loadAiaRuntimeConfig();
  const aiaMetrics = getSharedAiaScheduler().metrics();
  const aiaLookup = buildAiaRunLookup(loadAiaQueueFile().runs);
  const retryableIds = new Set(retryable.map((n) => n.id));
  const rootHandoff = graph.nodes.get(rootId);

  const nodes = graph.waves.flatMap((wave, index) =>
    wave.flatMap((nodeId) => {
      const node = graph.nodes.get(nodeId);
      if (!node) return [];
      const dispatch = getWorkOrderDispatch(node);
      const aiaRun = resolveAiaRunForNode(node.id, dispatch, aiaLookup);
      const display = enrichHandoffDisplayFields(node);
      return [
        {
          id: node.id,
          title: display.title,
          column: display.column,
          agent: node.to_agent,
          status: node.status,
          work_kind: display.work_kind,
          due_date: display.due_date,
          assignee: display.assignee,
          blocked_on: display.blocked_on,
          depends_on: node.depends_on,
          depends_on_labels: node.depends_on.map((depId) => {
            const dep = graph.nodes.get(depId);
            return {
              id: depId,
              title: dep ? resolveWorkOrderTitle(dep) : depId,
            };
          }),
          dispatch,
          wave: index + 1,
          retryable: retryableIds.has(node.id),
          cancellable: node.status === "pending" || node.status === "waiting",
          aia: aiaRun
            ? {
                run_id: aiaRun.run_id,
                state: aiaRun.state,
                fail_reason: aiaRun.fail_reason,
              }
            : undefined,
        },
      ];
    }),
  );

  const seenRuns = new Set<string>();
  const aiaRuns: OrchestrationStatusPayload["aia_runs"] = [];
  for (const nodeId of graph.nodes.keys()) {
    const node = graph.nodes.get(nodeId)!;
    const aiaRun = resolveAiaRunForNode(nodeId, getWorkOrderDispatch(node), aiaLookup);
    if (!aiaRun || seenRuns.has(aiaRun.run_id)) continue;
    seenRuns.add(aiaRun.run_id);
    aiaRuns.push({
      run_id: aiaRun.run_id,
      work_order_id: aiaRun.work_order_id,
      agent_id: aiaRun.agent_id,
      state: aiaRun.state,
      fail_reason: aiaRun.fail_reason,
    });
  }

  return {
    rootId,
    planTitle: rootHandoff ? resolveWorkOrderTitle(rootHandoff) : rootId,
    nodeCount: graph.nodes.size,
    waveCount: graph.waves.length,
    readyCount: ready.length,
    blockedByFailureCount: blocked.length,
    retryableCount: retryable.length,
    cancellableCount,
    aia: {
      tier: aiaConfig.tier,
      max_concurrent: aiaConfig.max_concurrent_aia,
      running: aiaMetrics.aia_running,
      queued: aiaMetrics.aia_queued,
    },
    nodes,
    aia_runs: aiaRuns,
    blocked_downstream: blocked.map((node) => ({
      id: node.id,
      agent: node.to_agent,
      status: node.status,
    })),
  };
}

export function formatOrchestrationStatus(id: string): string {
  const payload = buildOrchestrationStatusPayload(id);
  const { rootId } = payload;

  const lines = [
    `# Orchestration Status · ${rootId}`,
    "",
    `**Nodes:** ${payload.nodeCount}`,
    `**Waves:** ${payload.waveCount}`,
    `**Ready:** ${payload.readyCount}`,
    `**Blocked by failure:** ${payload.blockedByFailureCount}`,
    "",
    "## AIA runtime",
    "",
    `| tier | max_concurrent | running | queued |`,
    `|------|----------------|---------|--------|`,
    `| ${payload.aia.tier} | ${payload.aia.max_concurrent} | ${payload.aia.running} | ${payload.aia.queued} |`,
    "",
    "## DAG",
    "",
    "| wave | id | agent | status | depends_on | attempts | trace | aia |",
    "|------|----|-------|--------|------------|----------|-------|-----|",
  ];

  for (const node of payload.nodes) {
    const aiaLabel = node.aia
      ? formatAiaState({
          run_id: node.aia.run_id,
          state: node.aia.state,
          fail_reason: node.aia.fail_reason,
        } as AiaRunRecord)
      : "—";
    lines.push(
      `| ${node.wave} | ${node.id} | ${node.agent} | ${node.status} | ${node.depends_on.join(", ") || "—"} | ${node.dispatch.attempts}/${node.dispatch.max_attempts} | ${node.dispatch.trace_id ?? "—"} | ${aiaLabel} |`,
    );
  }

  if (payload.aia_runs.length) {
    lines.push("", "## AIA runs (plan)", "");
    lines.push("| run_id | work_order | agent | state | fail_reason |");
    lines.push("|--------|------------|-------|-------|-------------|");
    for (const run of payload.aia_runs) {
      lines.push(
        `| ${run.run_id} | ${run.work_order_id ?? "—"} | ${run.agent_id} | ${run.state} | ${run.fail_reason ?? "—"} |`,
      );
    }
  }

  if (payload.blocked_downstream.length) {
    lines.push("", "## Blocked downstream", "");
    for (const node of payload.blocked_downstream) {
      lines.push(`- ${node.id} (${node.agent}) — ${node.status}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
