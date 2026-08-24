import type { LlmWorker, LlmWorkerTier } from "../../../schemas/llm-workers.js";

export type WorkerRuntimeStats = {
  worker_id: string;
  inflight: number;
  avg_latency_ms: number;
  last_error: string | null;
  last_ok_at: string | null;
  unhealthy_until: number;
  healthy: boolean;
};

type InternalStats = {
  inflight: number;
  ewma_latency_ms: number;
  last_error: string | null;
  last_ok_at: string | null;
  unhealthy_until: number;
};

const DEFAULT_COOLDOWN_MS = 30_000;

const byWorker = new Map<string, InternalStats>();

let queueDepth = 0;

function ensure(workerId: string): InternalStats {
  let s = byWorker.get(workerId);
  if (!s) {
    s = {
      inflight: 0,
      ewma_latency_ms: 0,
      last_error: null,
      last_ok_at: null,
      unhealthy_until: 0,
    };
    byWorker.set(workerId, s);
  }
  return s;
}

export function getWorkerInflight(workerId: string): number {
  return ensure(workerId).inflight;
}

export function getWorkerEwmaLatency(workerId: string): number {
  return ensure(workerId).ewma_latency_ms;
}

export function isWorkerHealthy(workerId: string, now = Date.now()): boolean {
  return ensure(workerId).unhealthy_until <= now;
}

export function markWorkerUnhealthy(
  workerId: string,
  error: string,
  cooldownMs = DEFAULT_COOLDOWN_MS,
): void {
  const s = ensure(workerId);
  s.last_error = error;
  s.unhealthy_until = Date.now() + cooldownMs;
}

export function clearWorkerUnhealthy(workerId: string): void {
  const s = ensure(workerId);
  s.unhealthy_until = 0;
}

export function beginWorkerInflight(workerId: string): void {
  ensure(workerId).inflight += 1;
}

export function endWorkerInflight(
  workerId: string,
  opts: { ok: boolean; latencyMs: number; error?: string },
): void {
  const s = ensure(workerId);
  s.inflight = Math.max(0, s.inflight - 1);
  if (opts.ok) {
    s.last_ok_at = new Date().toISOString();
    s.last_error = null;
    if (s.ewma_latency_ms <= 0) {
      s.ewma_latency_ms = opts.latencyMs;
    } else {
      s.ewma_latency_ms = Math.round(s.ewma_latency_ms * 0.7 + opts.latencyMs * 0.3);
    }
  } else if (opts.error) {
    s.last_error = opts.error;
  }
}

export function setQueueDepth(n: number): void {
  queueDepth = Math.max(0, n);
}

export function getQueueDepth(): number {
  return queueDepth;
}

export function getTotalInflight(): number {
  let total = 0;
  for (const s of byWorker.values()) total += s.inflight;
  return total;
}

export function snapshotWorkerStats(
  workers: LlmWorker[],
): Array<WorkerRuntimeStats & { tier: LlmWorkerTier }> {
  const now = Date.now();
  return workers.map((w) => {
    const s = ensure(w.id);
    return {
      worker_id: w.id,
      tier: w.tier,
      inflight: s.inflight,
      avg_latency_ms: s.ewma_latency_ms,
      last_error: s.last_error,
      last_ok_at: s.last_ok_at,
      unhealthy_until: s.unhealthy_until,
      healthy: s.unhealthy_until <= now,
    };
  });
}

/** Test helper — reset process-local state. */
export function resetLlmPoolStatsForTests(): void {
  byWorker.clear();
  queueDepth = 0;
}
