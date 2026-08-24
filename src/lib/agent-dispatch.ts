import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  dispatchManifestSchema,
  type DispatchManifest,
  type DispatchTask,
} from "../../schemas/queue.js";
import type { Handoff } from "../../schemas/routing.js";
import {
  DISPATCH_MANIFEST_PREFIX,
  loadHandoff,
  loadHandoffChildren,
  routingQueueDir,
} from "./routing.js";
import { getTenantId, ROOT_DIR } from "./tenant.js";
import { currentDate, writeYamlFile } from "./utils.js";
import { pushQueueEvent } from "./queue-db.js";
import { appendAuditEvent } from "./audit-log.js";
import { loadCloudAgentConfig, resolveDispatchRuntime } from "./cloud-agent.js";
import { isLlmApiConfigured } from "./operator-runtime/llm-api.js";
import { hasConfiguredLlmWorkers } from "./llm-pool/registry.js";
import { runOperatorDispatch } from "./operator-runtime/ask.js";
import { assertActiveTenant, assertIntraOrgAgentTarget, tenantDispatchRoot } from "./org-boundary.js";
import { scopesForAgent } from "./org/delegation-scopes.js";
import { checkAgentAccess, loadClassificationRegistry } from "./classification.js";
import { assertDispatchPathAllowed, runWithFsGuardAgentAsync } from "./org/fs-guard/index.js";
import {
  admitWithBackoff,
  getSharedAiaScheduler,
  persistAiaMetrics,
} from "./aia/scheduler.js";
import { appendModuleMessage } from "./module-messages/store.js";
import {
  buildPlanGraph,
  readyWorkOrders,
  resolvePlanRoot,
  syncDependencyStatuses,
} from "./orchestration/plan-graph.js";
import {
  completeWorkOrderViaState,
  getWorkOrderDispatch,
  newOrchestrationTraceId,
  transitionWorkOrder,
} from "./orchestration/work-order-state.js";

export type DispatchRuntime = "local" | "cloud" | "manifest";

function notifyDispatchModuleMessage(
  task: DispatchTask,
  ok: boolean,
  detail: string,
): void {
  try {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const suffix = task.work_order_id.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase() || "dispatch";
    appendModuleMessage({
      message_id: `MSG-${date}-${suffix}`,
      schema: "orgos.module.message.v1",
      from: { id: task.agent, kind: "agent" },
      to: { id: "integration", kind: "agent" },
      intent: "inform",
      confidentiality: "L1",
      status: "pending",
      refs: [{ work_order_id: task.work_order_id }],
      payload_summary: ok
        ? `Dispatch completed for ${task.work_order_id}`
        : `Dispatch failed for ${task.work_order_id}: ${detail.slice(0, 180)}`,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort — relay policy may deny some agent pairs in tests */
  }
}

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

function resolveRunnableWorkOrders(id: string): Handoff[] {
  const rootId = resolvePlanRoot(id);
  const graph = buildPlanGraph(rootId);
  syncDependencyStatuses(graph);
  const ready = readyWorkOrders(graph);
  if (ready.length > 0) {
    return ready;
  }
  return resolveWorkOrdersForDispatch(id).filter(
    (w) => w.status === "pending" || w.status === "dispatched",
  );
}

function readPromptText(relativePath: string): string {
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
  traceId?: string,
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
      skipQueueEvent: true,
    });
    pushQueueEvent({
      type: "dispatch_requested",
      ref: task.work_order_id,
      payload: {
        manifest_id: manifest.id,
        agent: task.agent,
        trace_id: manifest.trace_id,
        attempt: task.attempt,
      },
    });
  }
  appendAuditEvent({
    event: "escalate",
    ref: manifest.id,
    detail: `dispatch:${manifest.tasks.length} tasks`,
  });
  return path;
}

export interface DispatchRunResult {
  manifest: DispatchManifest;
  manifestPath: string;
  mode: "cursor_sdk" | "cursor_cloud" | "manifest" | "portable_llm" | "portable_shell";
  results: Array<{ work_order_id: string; ok: boolean; detail: string }>;
  trace_id: string;
}

export interface DispatchRunOptions {
  parallel?: number;
  dryRun?: boolean;
  runtime?: DispatchRuntime;
  retryFailed?: boolean;
  wave?: number;
  traceId?: string;
}

async function runPortableTask(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: ReturnType<typeof getSharedAiaScheduler>,
): Promise<{ work_order_id: string; ok: boolean; detail: string }> {
  const runId = `RUN-${task.work_order_id}`;
  transitionWorkOrder(task.work_order_id, "running", {
    traceId: manifest.trace_id,
    runId,
    incrementAttempt: true,
  });

  const admission = admitWithBackoff(scheduler, {
    run_id: runId,
    agent_id: task.agent,
    work_order_id: task.work_order_id,
  });
  if (!admission.admitted) {
    transitionWorkOrder(task.work_order_id, "failed", {
      traceId: manifest.trace_id,
      runId,
      error: admission.reason,
    });
    return {
      work_order_id: task.work_order_id,
      ok: false,
      detail: admission.reason,
    };
  }

  const promptText = readPromptText(task.prompt_relative ?? "");
  if (!promptText) {
    scheduler.release(runId, true);
    transitionWorkOrder(task.work_order_id, "completed", {
      traceId: manifest.trace_id,
      runId,
      completionNotes: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
    });
    return {
      work_order_id: task.work_order_id,
      ok: true,
      detail: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
    };
  }

  if (isLlmApiConfigured() || hasConfiguredLlmWorkers() || process.env.ORGOS_SHELL_PROFILE) {
    const dispatched = await runOperatorDispatch(promptText, {
      workOrderId: task.work_order_id,
      agent: task.agent,
      profile: process.env.ORGOS_SHELL_PROFILE,
    });
    scheduler.release(runId, dispatched.ok);
    notifyDispatchModuleMessage(task, dispatched.ok, dispatched.detail);
    if (dispatched.ok) {
      transitionWorkOrder(task.work_order_id, "completed", {
        traceId: manifest.trace_id,
        runId,
        completionNotes: dispatched.detail.slice(0, 300),
      });
    } else {
      transitionWorkOrder(task.work_order_id, "failed", {
        traceId: manifest.trace_id,
        runId,
        error: dispatched.detail,
      });
    }
    return {
      work_order_id: task.work_order_id,
      ok: dispatched.ok,
      detail: dispatched.detail.slice(0, 300),
    };
  }

  scheduler.release(runId, true);
  transitionWorkOrder(task.work_order_id, "completed", {
    traceId: manifest.trace_id,
    runId,
    completionNotes: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
  });
  return {
    work_order_id: task.work_order_id,
    ok: true,
    detail: `manifest · ${task.prompt_relative ?? task.prompt_path}`,
  };
}

async function runCursorTask(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: ReturnType<typeof getSharedAiaScheduler>,
  Agent: { prompt: (p: string, o: Record<string, unknown>) => Promise<{ status?: string; result?: unknown }> },
  apiKey: string,
  cloudCfg: ReturnType<typeof loadCloudAgentConfig>,
): Promise<{ work_order_id: string; ok: boolean; detail: string }> {
  const runId = `RUN-${task.work_order_id}`;
  transitionWorkOrder(task.work_order_id, "running", {
    traceId: manifest.trace_id,
    runId,
    incrementAttempt: true,
  });

  const admission = admitWithBackoff(scheduler, {
    run_id: runId,
    agent_id: task.agent,
    work_order_id: task.work_order_id,
  });
  if (!admission.admitted) {
    transitionWorkOrder(task.work_order_id, "failed", {
      traceId: manifest.trace_id,
      runId,
      error: admission.reason,
    });
    return {
      work_order_id: task.work_order_id,
      ok: false,
      detail: admission.reason,
    };
  }

  return runWithFsGuardAgentAsync(task.agent, async () => {
  try {
    const promptText = readPromptText(task.prompt_relative ?? "");
    const prompt = promptText || `Execute work order ${task.work_order_id}`;
    const baseOpts: Record<string, unknown> = {
      apiKey,
      model: { id: cloudCfg.cloud?.model ?? "composer-2.5" },
    };
    const useCloud = task.mode === "cursor_cloud";
    const result =
      useCloud && cloudCfg.cloud?.repository
        ? await Agent.prompt(prompt, {
            ...baseOpts,
            cloud: { repository: cloudCfg.cloud.repository, ref: cloudCfg.cloud.ref ?? "main" },
          })
        : await Agent.prompt(prompt, { ...baseOpts, local: { cwd: ROOT_DIR } });

    pushQueueEvent({
      type: "dispatch_complete",
      ref: task.work_order_id,
      status: "done",
      payload: {
        status: result.status,
        manifest_id: manifest.id,
        trace_id: manifest.trace_id,
      },
    });
    const ok =
      result.status === "completed" ||
      result.status === "success" ||
      !!result.result;
    scheduler.release(runId, ok);
    notifyDispatchModuleMessage(task, ok, String(result.result ?? result.status ?? "done"));
    if (ok) {
      transitionWorkOrder(task.work_order_id, "completed", {
        traceId: manifest.trace_id,
        runId,
        completionNotes: String(result.result ?? result.status ?? "done").slice(0, 300),
      });
    } else {
      transitionWorkOrder(task.work_order_id, "failed", {
        traceId: manifest.trace_id,
        runId,
        error: String(result.result ?? result.status ?? "failed"),
      });
    }
    return {
      work_order_id: task.work_order_id,
      ok,
      detail: String(result.result ?? result.status ?? "done").slice(0, 200),
    };
  } catch (err) {
    scheduler.release(runId, false);
    const detail = err instanceof Error ? err.message : String(err);
    transitionWorkOrder(task.work_order_id, "failed", {
      traceId: manifest.trace_id,
      runId,
      error: detail,
    });
    notifyDispatchModuleMessage(task, false, detail);
    return {
      work_order_id: task.work_order_id,
      ok: false,
      detail,
    };
  }
  });
}

async function executeManifestBatch(
  manifest: DispatchManifest,
  scheduler: ReturnType<typeof getSharedAiaScheduler>,
): Promise<{ mode: DispatchRunResult["mode"]; results: DispatchRunResult["results"] }> {
  const hasRunnableTask = manifest.tasks.some((t) => t.mode !== "manifest");
  if (!manifest.cursor_sdk_available || !hasRunnableTask) {
    const portableResults: DispatchRunResult["results"] = [];
    let portableMode: DispatchRunResult["mode"] = "manifest";

    for (const task of manifest.tasks) {
      const result = await runPortableTask(task, manifest, scheduler);
      if (result.ok && result.detail.includes("manifest ·")) {
        /* manifest-only */
      } else if (result.detail && !result.ok) {
        portableMode = "manifest";
      } else if (process.env.ORGOS_SHELL_PROFILE) {
        portableMode = "portable_shell";
      } else if (isLlmApiConfigured() || hasConfiguredLlmWorkers()) {
        portableMode = "portable_llm";
      }
      portableResults.push(result);
    }

    return { mode: portableMode, results: portableResults };
  }

  type SdkResult = { status?: string; result?: unknown };
  let Agent: { prompt: (p: string, o: Record<string, unknown>) => Promise<SdkResult> };
  try {
    const sdk = (await new Function('return import("@cursor/sdk")')()) as {
      Agent: typeof Agent;
    };
    Agent = sdk.Agent;
  } catch {
    return {
      mode: "manifest",
      results: manifest.tasks.map((t) => ({
        work_order_id: t.work_order_id,
        ok: false,
        detail: "Cursor SDK import failed",
      })),
    };
  }

  const apiKey = process.env.CURSOR_API_KEY!;
  const cloudCfg = loadCloudAgentConfig();
  const parallel = manifest.parallel;
  const results: DispatchRunResult["results"] = [];

  for (let i = 0; i < manifest.tasks.length; i += parallel) {
    const batch = manifest.tasks.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map((task) => runCursorTask(task, manifest, scheduler, Agent, apiKey, cloudCfg)),
    );
    results.push(...batchResults);
  }

  const runMode: DispatchRunResult["mode"] = manifest.tasks.some((t) => t.mode === "cursor_cloud")
    ? "cursor_cloud"
    : "cursor_sdk";
  return { mode: runMode, results };
}

export async function runDispatch(
  id: string,
  options?: DispatchRunOptions,
): Promise<DispatchRunResult> {
  const scheduler = getSharedAiaScheduler();
  const traceId = options?.traceId ?? newOrchestrationTraceId();

  if (options?.retryFailed) {
    const { retryFailedWorkOrders } = await import("./orchestration/orchestrate-actions.js");
    retryFailedWorkOrders(id);
  }

  const allResults: DispatchRunResult["results"] = [];
  let lastManifest = buildDispatchManifest(id, options?.parallel ?? 3, options?.runtime, traceId);
  let manifestPath = "";
  let mode: DispatchRunResult["mode"] = "manifest";

  if (options?.dryRun) {
    return { manifest: lastManifest, manifestPath: "", mode, results: [], trace_id: traceId };
  }

  let waveIndex = 0;
  while (true) {
    waveIndex += 1;
    if (options?.wave != null && waveIndex > options.wave) break;

    lastManifest = buildDispatchManifest(id, options?.parallel ?? 3, options?.runtime, traceId);
    if (lastManifest.tasks.length === 0) break;

    manifestPath = writeDispatchManifest(lastManifest);
    const batch = await executeManifestBatch(lastManifest, scheduler);
    mode = batch.mode;
    allResults.push(...batch.results);

    const rootId = resolvePlanRoot(id);
    syncDependencyStatuses(buildPlanGraph(rootId));

    if (options?.wave != null) break;
    if (buildDispatchManifest(id, options?.parallel ?? 3, options?.runtime, traceId).tasks.length === 0) {
      break;
    }
  }

  persistAiaMetrics(scheduler);
  return {
    manifest: lastManifest,
    manifestPath,
    mode,
    results: allResults,
    trace_id: traceId,
  };
}

export function formatDispatchPlan(manifest: DispatchManifest): string {
  const lines = [
    `# Dispatch Plan · ${manifest.id}`,
    "",
    `**Tenant:** ${manifest.tenant}`,
    `**Tasks:** ${manifest.tasks.length}`,
    `**Parallel:** ${manifest.parallel}`,
    `**Trace:** ${manifest.trace_id ?? "—"}`,
    `**Cursor SDK:** ${manifest.cursor_sdk_available ? "yes" : "no (manifest only)"}`,
    "",
    "| work_order | agent | mode | attempt | prompt |",
    "|------------|-------|------|---------|--------|",
    ...manifest.tasks.map(
      (t) =>
        `| ${t.work_order_id} | ${t.agent} | ${t.mode} | ${t.attempt ?? "—"} | ${t.prompt_relative ?? "—"} |`,
    ),
    "",
  ];
  if (!manifest.cursor_sdk_available) {
    lines.push(
      "## Portable dispatch (no Cursor SDK)",
      "",
      "1. `orgos agent implement --id <IMP-...>` — LLM API / Aider / shell",
      "2. `orgos orchestrate run --id <IMP-...>` — wave-aware dispatch",
      "3. Prompt MD includes full agent definition (tool-neutral)",
      "",
      "Optional Cursor: `npm install @cursor/sdk` + `CURSOR_API_KEY`",
      "",
    );
  }
  return lines.join("\n");
}

// Re-export for tests / CLI
export { completeWorkOrderViaState };
