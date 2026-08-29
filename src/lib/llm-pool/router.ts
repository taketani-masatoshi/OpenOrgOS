import type {
  LlmRouteHint,
  LlmWorker,
  LlmWorkersConfig,
} from "../../../schemas/llm-workers.js";
import type { LlmApiConfig } from "../operator-runtime/llm-api.js";
import {
  loadLlmWorkersConfig,
  workerToLlmApiConfig,
} from "./registry.js";
import {
  beginWorkerInflight,
  endWorkerInflight,
  getQueueDepth,
  getWorkerEwmaLatency,
  getWorkerInflight,
  isWorkerHealthy,
  markWorkerUnhealthy,
  setQueueDepth,
} from "./stats.js";

export type { LlmRouteHint };

export type LlmWorkerLease = {
  worker: LlmWorker;
  target: LlmApiConfig;
  queued_ms: number;
};

export class LlmPoolError extends Error {
  constructor(
    message: string,
    readonly code: "queue_full" | "queue_timeout" | "no_workers" | "all_failed",
  ) {
    super(message);
    this.name = "LlmPoolError";
  }
}

type Waiter = {
  enqueuedAt: number;
  hint?: LlmRouteHint;
  resolve: (lease: { worker: LlmWorker; queued_ms: number }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const waiters: Waiter[] = [];

let configOverride: LlmWorkersConfig | null = null;

/** Tests / hot-reload after PUT. */
export function setLlmPoolConfigOverride(config: LlmWorkersConfig | null): void {
  configOverride = config;
}

function activeConfig(): LlmWorkersConfig {
  return configOverride ?? loadLlmWorkersConfig();
}

function matchesHint(worker: LlmWorker, hint?: LlmRouteHint): boolean {
  if (!hint) return true;
  if (hint.worker_id && worker.id !== hint.worker_id) return false;
  if (hint.mode === "local" || hint.mode === "cloud") {
    return worker.tier === hint.mode;
  }
  return true;
}

function noWorkersMessage(hint?: LlmRouteHint): string {
  if (hint?.worker_id) return `LLM worker not available: ${hint.worker_id}`;
  if (hint?.mode === "local") return "No enabled local LLM workers";
  if (hint?.mode === "cloud") return "No enabled cloud LLM workers";
  return "No enabled LLM workers";
}

function eligibleWorkers(
  config: LlmWorkersConfig,
  tier?: "local" | "cloud",
  hint?: LlmRouteHint,
): LlmWorker[] {
  const now = Date.now();
  return config.workers.filter((w) => {
    if (!w.enabled) return false;
    if (tier && w.tier !== tier) return false;
    if (!matchesHint(w, hint)) return false;
    if (getWorkerInflight(w.id) >= w.max_inflight) return false;
    if (hint?.worker_id === w.id) return true;
    return isWorkerHealthy(w.id, now);
  });
}

function pickLeastInflight(candidates: LlmWorker[]): LlmWorker | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const ai = getWorkerInflight(a.id);
    const bi = getWorkerInflight(b.id);
    if (ai !== bi) return ai - bi;
    return getWorkerEwmaLatency(a.id) - getWorkerEwmaLatency(b.id);
  });
  return sorted[0] ?? null;
}

function tryAcquire(preferCloud = false, hint?: LlmRouteHint): LlmWorker | null {
  const config = activeConfig();
  if (hint?.worker_id || hint?.mode === "local" || hint?.mode === "cloud") {
    return pickLeastInflight(eligibleWorkers(config, undefined, hint));
  }
  if (preferCloud) {
    return pickLeastInflight(eligibleWorkers(config, "cloud", hint));
  }
  const local = pickLeastInflight(eligibleWorkers(config, "local", hint));
  if (local) return local;
  // No local capacity: only use cloud immediately if there are no local workers at all.
  const anyLocal = config.workers.some((w) => w.enabled && w.tier === "local");
  if (!anyLocal) {
    return pickLeastInflight(eligibleWorkers(config, "cloud", hint));
  }
  return null;
}

function cloudOverflowReady(waiter: Waiter, config: LlmWorkersConfig): boolean {
  if (waiter.hint?.mode === "local" || waiter.hint?.worker_id) return false;
  if (waiter.hint?.mode === "cloud") return false;
  const overflow = config.queue.cloud_overflow;
  if (!overflow.enabled) return false;
  const waited = Date.now() - waiter.enqueuedAt;
  if (waited < overflow.wait_threshold_ms) return false;
  const cloudInflight = config.workers
    .filter((w) => w.tier === "cloud" && w.enabled)
    .reduce((s, w) => s + getWorkerInflight(w.id), 0);
  if (cloudInflight >= overflow.max_inflight) return false;
  return eligibleWorkers(config, "cloud").length > 0;
}

function syncQueueDepth(): void {
  setQueueDepth(waiters.length);
}

function drainQueue(): void {
  const config = activeConfig();
  while (waiters.length > 0) {
    const head = waiters[0]!;
    const preferCloud = cloudOverflowReady(head, config);
    const worker = tryAcquire(preferCloud, head.hint);
    if (!worker) {
      // Local free? Prefer that even if overflow not yet ready.
      if (!preferCloud) {
        const local = tryAcquire(false, head.hint);
        if (local) {
          waiters.shift();
          clearTimeout(head.timer);
          beginWorkerInflight(local.id);
          head.resolve({
            worker: local,
            queued_ms: Date.now() - head.enqueuedAt,
          });
          continue;
        }
      }
      break;
    }
    waiters.shift();
    clearTimeout(head.timer);
    beginWorkerInflight(worker.id);
    head.resolve({
      worker,
      queued_ms: Date.now() - head.enqueuedAt,
    });
  }
  syncQueueDepth();
}

async function acquireLease(
  hint?: LlmRouteHint,
): Promise<{ worker: LlmWorker; queued_ms: number }> {
  const config = activeConfig();
  const enabled = config.workers.filter((w) => w.enabled && matchesHint(w, hint));
  if (enabled.length === 0) {
    throw new LlmPoolError(noWorkersMessage(hint), "no_workers");
  }

  const immediate = tryAcquire(false, hint);
  if (immediate) {
    beginWorkerInflight(immediate.id);
    return { worker: immediate, queued_ms: 0 };
  }

  if (waiters.length >= config.queue.max_queue) {
    throw new LlmPoolError(
      `LLM queue full (max ${config.queue.max_queue})`,
      "queue_full",
    );
  }

  return new Promise((resolve, reject) => {
    const enqueuedAt = Date.now();
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(waiter);
      if (idx >= 0) waiters.splice(idx, 1);
      syncQueueDepth();
      reject(
        new LlmPoolError(
          `LLM queue timeout after ${config.queue.queue_timeout_ms}ms`,
          "queue_timeout",
        ),
      );
    }, config.queue.queue_timeout_ms);

    const waiter: Waiter = {
      enqueuedAt,
      hint,
      resolve,
      reject,
      timer,
    };
    waiters.push(waiter);
    syncQueueDepth();

    // Periodic check for cloud overflow while waiting.
    const tick = setInterval(() => {
      if (!waiters.includes(waiter)) {
        clearInterval(tick);
        return;
      }
      drainQueue();
    }, 250);
    // Clear tick when resolved/rejected via wrapper
    const origResolve = waiter.resolve;
    const origReject = waiter.reject;
    waiter.resolve = (v) => {
      clearInterval(tick);
      origResolve(v);
    };
    waiter.reject = (e) => {
      clearInterval(tick);
      origReject(e);
    };
  });
}

function releaseLease(
  worker: LlmWorker,
  opts: { ok: boolean; latencyMs: number; error?: string; markUnhealthy?: boolean },
): void {
  endWorkerInflight(worker.id, {
    ok: opts.ok,
    latencyMs: opts.latencyMs,
    error: opts.error,
  });
  if (opts.markUnhealthy && opts.error) {
    markWorkerUnhealthy(worker.id, opts.error);
  }
  drainQueue();
}

function isRetryableTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|LLM API 5\d\d|Anthropic API 5\d\d/i.test(
      msg,
    )
  );
}

/**
 * Lease a worker for the duration of `fn`. Retries once on a different worker
 * if the first fails with a transport/5xx error.
 */
export async function withLlmWorker<T>(
  fn: (lease: LlmWorkerLease) => Promise<T>,
  hint?: LlmRouteHint,
): Promise<T> {
  const first = await acquireLease(hint);
  const started = Date.now();
  try {
    const result = await fn({
      worker: first.worker,
      target: workerToLlmApiConfig(first.worker),
      queued_ms: first.queued_ms,
    });
    releaseLease(first.worker, { ok: true, latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    const retryable = isRetryableTransportError(err);
    releaseLease(first.worker, {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      markUnhealthy: retryable,
    });
    if (!retryable) throw err;
    if (hint?.worker_id) throw err;

    // One retry on a different worker (same route hint).
    const second = await acquireLease(hint);
    if (second.worker.id === first.worker.id) {
      releaseLease(second.worker, {
        ok: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const started2 = Date.now();
    try {
      const result = await fn({
        worker: second.worker,
        target: workerToLlmApiConfig(second.worker),
        queued_ms: first.queued_ms + second.queued_ms,
      });
      releaseLease(second.worker, { ok: true, latencyMs: Date.now() - started2 });
      return result;
    } catch (err2) {
      releaseLease(second.worker, {
        ok: false,
        latencyMs: Date.now() - started2,
        error: err2 instanceof Error ? err2.message : String(err2),
        markUnhealthy: isRetryableTransportError(err2),
      });
      throw err2;
    }
  }
}

export function getLlmPoolQueueSnapshot(): {
  queued: number;
  max_queue: number;
} {
  const config = activeConfig();
  return {
    queued: getQueueDepth(),
    max_queue: config.queue.max_queue,
  };
}

/** Test helper — reject all waiters and clear. */
export function resetLlmPoolRouterForTests(): void {
  while (waiters.length > 0) {
    const w = waiters.shift()!;
    clearTimeout(w.timer);
    w.reject(new LlmPoolError("reset", "all_failed"));
  }
  configOverride = null;
  setQueueDepth(0);
}
