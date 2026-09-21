import { describe, expect, it } from "vitest";
import { recoverInFlightFiling } from "../src/lib/efiling/recovery.js";

const inflight = {
  status: "SUBMITTED" as const,
  requestId: "req",
  attempts: [{ requestId: "req", outcome: "started" as const }],
};

describe("efiling in-flight recovery", () => {
  it("keeps state and escalates when lookup is unknown", () => {
    const result = recoverInFlightFiling(inflight, { status: "unknown" });
    expect(result.record.status).toBe("SUBMITTED");
    expect(result.escalate).toBe(true);
    expect(result.resendAllowed).toBe(false);
  });

  it("returns to SIGNED when the receipt is not found", () => {
    const result = recoverInFlightFiling(inflight, { status: "not_found" });
    expect(result.record.status).toBe("SIGNED");
    expect(result.resendAllowed).toBe(true);
  });

  it("stores the receipt when lookup finds it", () => {
    const result = recoverInFlightFiling(inflight, { status: "found", receiptNumber: "RCPT-9" });
    expect(result.record.status).toBe("RECEIVED_BY_ETAX");
    expect(result.record.receiptNumber).toBe("RCPT-9");
    expect(result.resendAllowed).toBe(false);
  });
});
