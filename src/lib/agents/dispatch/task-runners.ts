import type { DispatchManifest, DispatchTask } from "../../../../schemas/queue.js";
import { pushQueueEvent } from "../../queue-db.js";
import { loadCloudAgentConfig } from "../../cloud-agent.js";
import { isLlmApiConfigured } from "../../operator-runtime/llm-api.js";
import { hasConfiguredLlmWorkers } from "../../llm-pool/registry.js";
import { runOperatorDispatch } from "../../operator-runtime/ask.js";
import { ROOT_DIR } from "../../tenant.js";
import { runWithFsGuardAgentAsync } from "../../org/fs-guard/index.js";
import { admitWithBackoff, getSharedAiaScheduler } from "../../aia/scheduler.js";
import { appendModuleMessage } from "../../module-messages/store.js";
import { utcDateCompact } from "../utc-date.js";
import { transitionWorkOrder } from "../../orchestration/work-order-state.js";
import { readPromptText } from "./manifest.js";
import type { CursorSdkAgent } from "./cursor-sdk.js";

type Scheduler = ReturnType<typeof getSharedAiaScheduler>;
type DispatchTaskResult = { work_order_id: string; ok: boolean; detail: string };

function notifyDispatchModuleMessage(
  task: DispatchTask,
  ok: boolean,
  detail: string,
): void {
  try {
    const date = utcDateCompact();
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

function startDispatchRun(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: Scheduler,
): { runId: string } | DispatchTaskResult {
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
  return { runId };
}

function completeManifestOnly(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: Scheduler,
  runId: string,
): DispatchTaskResult {
  const detail = `manifest · ${task.prompt_relative ?? task.prompt_path}`;
  scheduler.release(runId, true);
  transitionWorkOrder(task.work_order_id, "completed", {
    traceId: manifest.trace_id,
    runId,
    completionNotes: detail,
  });
  return { work_order_id: task.work_order_id, ok: true, detail };
}

function finishDispatchOutcome(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: Scheduler,
  runId: string,
  ok: boolean,
  detail: string,
  opts?: { notifyDetail?: string; returnSlice?: number },
): DispatchTaskResult {
  const notifyDetail = opts?.notifyDetail ?? detail;
  const returnSlice = opts?.returnSlice ?? 300;
  scheduler.release(runId, ok);
  notifyDispatchModuleMessage(task, ok, notifyDetail);
  if (ok) {
    transitionWorkOrder(task.work_order_id, "completed", {
      traceId: manifest.trace_id,
      runId,
      completionNotes: detail.slice(0, 300),
    });
  } else {
    transitionWorkOrder(task.work_order_id, "failed", {
      traceId: manifest.trace_id,
      runId,
      error: detail,
    });
  }
  return {
    work_order_id: task.work_order_id,
    ok,
    detail: detail.slice(0, returnSlice),
  };
}

export async function runPortableTask(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: Scheduler,
): Promise<DispatchTaskResult> {
  const started = startDispatchRun(task, manifest, scheduler);
  if ("ok" in started) return started;
  const { runId } = started;

  const promptText = readPromptText(task.prompt_relative ?? "");
  if (!promptText) {
    return completeManifestOnly(task, manifest, scheduler, runId);
  }

  if (isLlmApiConfigured() || hasConfiguredLlmWorkers() || process.env.ORGOS_SHELL_PROFILE) {
    const dispatched = await runOperatorDispatch(promptText, {
      workOrderId: task.work_order_id,
      agent: task.agent,
      profile: process.env.ORGOS_SHELL_PROFILE,
    });
    return finishDispatchOutcome(
      task,
      manifest,
      scheduler,
      runId,
      dispatched.ok,
      dispatched.detail,
    );
  }

  return completeManifestOnly(task, manifest, scheduler, runId);
}

export async function runCursorTask(
  task: DispatchTask,
  manifest: DispatchManifest,
  scheduler: Scheduler,
  Agent: CursorSdkAgent,
  apiKey: string,
  cloudCfg: ReturnType<typeof loadCloudAgentConfig>,
): Promise<DispatchTaskResult> {
  const started = startDispatchRun(task, manifest, scheduler);
  if ("ok" in started) return started;
  const { runId } = started;

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
    const notifyDetail = String(result.result ?? result.status ?? "done");
    const transitionDetail = ok
      ? notifyDetail
      : String(result.result ?? result.status ?? "failed");
    scheduler.release(runId, ok);
    notifyDispatchModuleMessage(task, ok, notifyDetail);
    if (ok) {
      transitionWorkOrder(task.work_order_id, "completed", {
        traceId: manifest.trace_id,
        runId,
        completionNotes: notifyDetail.slice(0, 300),
      });
    } else {
      transitionWorkOrder(task.work_order_id, "failed", {
        traceId: manifest.trace_id,
        runId,
        error: transitionDetail,
      });
    }
    return {
      work_order_id: task.work_order_id,
      ok,
      detail: notifyDetail.slice(0, 200),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return finishDispatchOutcome(task, manifest, scheduler, runId, false, detail, {
      returnSlice: detail.length,
    });
  }
  });
}
