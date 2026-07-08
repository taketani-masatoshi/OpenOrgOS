import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { computeComplianceGap, formatComplianceGapReport } from "../src/lib/compliance-gap.js";

describe("compliance gap", () => {
  beforeEach(() => {
    setTenantId("acme");
  });

  it("computes gap report for acme", () => {
    const result = computeComplianceGap();
    expect(result.enabledIso).toBeDefined();
    expect(result.effectiveRegs.length).toBeGreaterThan(0);
    expect(formatComplianceGapReport()).toContain("Compliance Gap");
  });

  it("mal has governance regs effective", () => {
    setTenantId("mal");
    const result = computeComplianceGap();
    expect(result.effectiveRegs.length).toBeGreaterThan(10);
  });
});
