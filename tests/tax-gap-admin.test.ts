import { describe, expect, it, beforeEach } from "vitest";
import { summarizeTaxFilingGaps, tryLoadTaxFilingGaps } from "../src/lib/finance/tax-filing-gaps.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("tax gap admin", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("summarize includes deferred and advisor_pending", () => {
    const summary = summarizeTaxFilingGaps(tryLoadTaxFilingGaps());
    expect(summary.deferred).toBeGreaterThan(0);
    expect(summary.advisor_pending).toBeGreaterThan(0);
    expect(summary.open).toBe(0);
  });
});
