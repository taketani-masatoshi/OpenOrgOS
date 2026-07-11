import { describe, it, expect } from "vitest";
import {
  computeWirePendingBackoffSec,
  computeNextRetryAt,
  isWirePendingReadyForRetry,
  isWirePendingDeadLetter,
  WIRE_PENDING_MAX_ATTEMPTS,
} from "../src/lib/protocol/wire-pending-retry.js";

describe("wire-pending retry", () => {
  it("exponential backoff grows and caps", () => {
    expect(computeWirePendingBackoffSec(0)).toBe(30);
    expect(computeWirePendingBackoffSec(1)).toBe(60);
    expect(computeWirePendingBackoffSec(20)).toBeLessThanOrEqual(86_400);
  });

  it("isWirePendingReadyForRetry respects next_retry_at", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(
      isWirePendingReadyForRetry({
        peer_id: "P",
        event_id: "00000000-0000-4000-8000-000000000001",
        envelope_digest: "a".repeat(64),
        attempts: 1,
        created_at: new Date().toISOString(),
        next_retry_at: future,
      })
    ).toBe(false);
  });

  it("dead letter at max attempts", () => {
    expect(
      isWirePendingDeadLetter({
        peer_id: "P",
        event_id: "00000000-0000-4000-8000-000000000001",
        envelope_digest: "a".repeat(64),
        attempts: WIRE_PENDING_MAX_ATTEMPTS,
        created_at: new Date().toISOString(),
      })
    ).toBe(true);
    const past = computeNextRetryAt(WIRE_PENDING_MAX_ATTEMPTS, Date.now() - 1000);
    expect(new Date(past).getTime()).toBeGreaterThan(Date.now());
  });
});
