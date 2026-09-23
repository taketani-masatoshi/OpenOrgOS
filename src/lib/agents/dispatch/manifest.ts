import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dispatchManifestSchema,
  type DispatchManifest,
  type DispatchTask,
} from "../../../../schemas/queue.js";
import type { Handoff } from "../../../../schemas/routing.js";
import {
  DISPATCH_MANIFEST_PREFIX,
  loadHandoff,
  loadHandoffChildren,
  routingQueueDir,
} from "../../routing.js";
import { getTenantId, ROOT_DIR } from "../../tenant.js";
import { currentDate, writeYamlFile } from "../../utils.js";
import { appendAuditEvent } from "../../audit-log.js";
import { loadCloudAgentConfig, resolveDispatchRuntime } from "../../cloud-agent.js";
import { assertActiveTenant, assertIntraOrgAgentTarget } from "../../org-boundary.js";
import { scopesForAgent } from "../../org/delegation-scopes.js";
import { checkAgentAccess, loadClassificationRegistry } from "../../classification.js";
import { assertDispatchPathAllowed } from "../../org/fs-guard/index.js";
import { getSharedAiaScheduler } from "../../aia/scheduler.js";
import {
  getWorkOrderDispatch,
  newOrchestrationTraceId,
  transitionWorkOrder,
} from "../../orchestration/work-order-state.js";
import { resolvePlanRoot, resolveRunnableWorkOrders } from "../../orchestration/plan-graph.js";

export type DispatchRuntime = "local" | "cloud" | "manifest";

export function isCursorSdkAvailable(): boolean {
  if (!process.env.CURSOR_API_KEY?.trim()) return false;
  try {
    const pkgPath = join(ROOT_DIR, "node_modules", "@cursor", "sdk", "package.json");
    return existsSync(pkgPath);
  } catch {
    return false;
  }
}

export function resolveWorkOrdersForDispatch(id: string): Handoff[] {
  const root = loadHandoff(id);
  if (root.child_ids?.length) {
    return loadHandoffChildren(root);
  }
  if (root.task_type === "implement" || root.id.startsWith("IMP-")) {
    return [root];
  }
  throw new Error(`${id} is not an implement work order or parent`);
}

export function readPromptText(relativePath: string): string {
  const abs = join(routingQueueDir(), relativePath);
  if (!existsSync(abs)) return "";
  return readFileSync(abs, "utf-8");
}

function assertWorkOrderDispatchable(workOrder: Handoff): void {
  assertActiveTenant(workOrder.tenant, `dispatch work order ${workOrder.id}`);
  assertIntraOrgAgentTarget(workOrder.to_agent, `dispatch work order ${workOrder.id}`);
  const scopes = scopesForAgent(workOrder.to_agent);
  if (!scopes.length) {
    throw new Error(`Agent ${workOrder.to_agent} has no delegation scopes`);
  }
  if (workOrder.context.path) {
    const reg = loadClassificationRegistry();
    const access = checkAgentAccess(reg, workOrder.to_agent, workOrder.context.path, "write");
    if (!access.allowed) {
      throw new Error(`Dispatch blocked: ${access.reason}`);
    }
    assertDispatchPathAllowed(workOrder.to_agent, workOrder.context.path);
  }
}

export function buildDispatchManifest(
  id: string,
  parallel = 3,
  runtimePref?: DispatchRuntime,
  traceId?: string
): DispatchManifest {
  const scheduler = getSharedAiaScheduler();
  const effectiveParallel = scheduler.clampParallelHint(parallel);
  const workOrders = resolveRunnableWorkOrders(id);
  for (const w of workOrders) {
    assertWorkOrderDispatchable(w);
  }
  const parent = workOrders[0]?.parent_id ? loadHandoff(workOrders[0].parent_id) : undefined;
  const runtime = resolveDispatchRuntime(runtimePref);
  const sdk = isCursorSdkAvailable();
  const cloudCfg = loadCloudAgentConfig();
  const resolvedTraceId = traceId ?? newOrchestrationTraceId();

  const tasks: DispatchTask[] = workOrders.map((w) => {
    let mode: "cursor_sdk" | "cursor_cloud" | "manifest" = "manifest";
    if (sdk) {
      if (runtime === "cloud" && cloudCfg.cloud?.repository) mode = "cursor_cloud";
      else if (runtime !== "manifest") mode = "cursor_sdk";
    }
    const dispatch = getWorkOrderDispatch(w);
    return {
      work_order_id: w.id,
      agent: w.to_agent,
      prompt_path: join(routingQueueDir(), w.agent_prompt_path ?? ""),
      prompt_relative: w.agent_prompt_path,
      mode,
      attempt: dispatch.attempts + 1,
      trace_id: resolvedTraceId,
    };
  });

  return dispatchManifestSchema.parse({
    id: `${DISPATCH_MANIFEST_PREFIX}${currentDate().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    tenant: getTenantId(),
    parent_id: parent?.id ?? (workOrders.length === 1 ? undefined : resolvePlanRoot(id)),
    parallel: effectiveParallel,
    tasks,
    cursor_sdk_available: sdk,
    trace_id: resolvedTraceId,
  });
}

export function writeDispatchManifest(manifest: DispatchManifest): string {
  const path = join(routingQueueDir(), `${manifest.id}.yaml`);
  writeYamlFile(path, manifest);
  for (const task of manifest.tasks) {
    transitionWorkOrder(task.work_order_id, "dispatched", {
      traceId: manifest.trace_id,
      runId: `RUN-${task.work_order_id}`,
      eventPayload: { manifest_id: manifest.id, attempt: task.attempt },
    });
  }
  appendAuditEvent({
    event: "escalate",
    ref: manifest.id,
    detail: `dispatch:${manifest.tasks.length} tasks`,
  });
  return path;
}
