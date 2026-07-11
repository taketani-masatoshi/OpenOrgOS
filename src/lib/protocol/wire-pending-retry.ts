import type { WirePendingEntry } from "../../../schemas/protocol/wire-pending.js";

/** Max delivery attempts before dead-letter drop from wire-pending queue. */
export const WIRE_PENDING_MAX_ATTEMPTS = 12;

/** Base backoff seconds (exponential: base * 2^attempts, capped). */
export const WIRE_PENDING_BACKOFF_BASE_SEC = 30;

/** Max backoff between flush retries (24h). */
export const WIRE_PENDING_BACKOFF_MAX_SEC = 86_400;

export function computeWirePendingBackoffSec(attempts: number): number {
  const exp = WIRE_PENDING_BACKOFF_BASE_SEC * Math.pow(2, Math.min(attempts, 10));
  return Math.min(Math.floor(exp), WIRE_PENDING_BACKOFF_MAX_SEC);
}

export function computeNextRetryAt(attempts: number, fromMs = Date.now()): string {
  const delayMs = computeWirePendingBackoffSec(attempts) * 1000;
  return new Date(fromMs + delayMs).toISOString();
}

export function isWirePendingReadyForRetry(entry: WirePendingEntry, nowMs = Date.now()): boolean {
  if (entry.attempts >= WIRE_PENDING_MAX_ATTEMPTS) return false;
  if (!entry.next_retry_at) return true;
  return new Date(entry.next_retry_at).getTime() <= nowMs;
}

export function isWirePendingDeadLetter(entry: WirePendingEntry): boolean {
  return entry.attempts >= WIRE_PENDING_MAX_ATTEMPTS;
}
