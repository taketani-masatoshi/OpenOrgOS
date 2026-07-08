import { describe, it, expect } from "vitest";
import { sanitizeForTrackedOutput, assertSafeForTrackedOutput } from "../src/lib/sanitize-output.js";

describe("sanitize-output", () => {
  it("redacts 7-digit account numbers", () => {
    const out = sanitizeForTrackedOutput("振込先口座 1234567 です");
    expect(out).not.toContain("1234567");
    expect(out).toContain("[REDACTED-L2]");
  });

  it("redacts email in tracked output", () => {
    const out = sanitizeForTrackedOutput("連絡先 [redacted-email]");
    expect(out).not.toContain("@gmail.com");
  });

  it("assertSafeForTrackedOutput fails when L2 present", () => {
    const r = assertSafeForTrackedOutput("口座 7654321");
    expect(r.ok).toBe(false);
  });

  it("passes clean L1 summary", () => {
    const r = assertSafeForTrackedOutput("BANK-001 から 10万円 · STK-003 へ");
    expect(r.ok).toBe(true);
  });
});
