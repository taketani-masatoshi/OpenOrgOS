import type { DispatchManifest } from "../../../../schemas/queue.js";
import { loadCloudAgentConfig } from "../../cloud-agent.js";
import { isLlmApiConfigured } from "../../operator-runtime/llm-api.js";
import { hasConfiguredLlmWorkers } from "../../llm-pool/registry.js";
import { getSharedAiaScheduler, persistAiaMetrics } from "../../aia/scheduler.js";
import {
  buildPlanGraph,
  resolvePlanRoot,
  syncDependencyStatuses,
} from "../../orchestration/plan-graph.js";
import { newOrchestrationTraceId } from "../../orchestration/work-order-state.js";
import { buildDispatchManifest, writeDispatchManifest, type DispatchRuntime } from "./manifest.js";
import { loadCursorSdk } from "./cursor-sdk.js";
import { runCursorTask, runPortableTask } from "./task-runners.js";

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

async function executeManifestBatch(
  manifest: DispatchManifest,
  scheduler: ReturnType<typeof getSharedAiaScheduler>
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

  let Agent: Awaited<ReturnType<typeof loadCursorSdk>>["Agent"];
  try {
    const sdk = await loadCursorSdk();
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
      batch.map((task) => runCursorTask(task, manifest, scheduler, Agent, apiKey, cloudCfg))
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
  options?: DispatchRunOptions
): Promise<DispatchRunResult> {
  const scheduler = getSharedAiaScheduler();
  const traceId = options?.traceId ?? newOrchestrationTraceId();

  if (options?.retryFailed) {
    const { retryFailedWorkOrders } = await import("../../orchestration/orchestrate-actions.js");
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
    if (
      buildDispatchManifest(id, options?.parallel ?? 3, options?.runtime, traceId).tasks.length ===
      0
    ) {
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
