import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  assertWireGovernanceApproval,
  resolveWireGovernanceTier,
  loadAuthorizedApprovers,
} from "../src/lib/jurisdiction/wire-governance/index.js";

describe("jurisdiction wire governance", () => {
  beforeEach(() => setTenantId("demo"));

  it("resolves tiers by JPY amount (JP jurisdiction)", () => {
    expect(resolveWireGovernanceTier(50_000, "JPY")).toBe("A");
    expect(resolveWireGovernanceTier(500_000, "JPY")).toBe("B");
    expect(resolveWireGovernanceTier(2_000_000, "JPY")).toBe("C");
  });

  it("tier A accepts demo CEO operator as approver", () => {
    const result = assertWireGovernanceApproval({
      amount: 85_000,
      currency: "JPY",
      approverId: "DemoCEO",
    });
    expect(result.tier).toBe("A");
    expect(result.policyRef).toBe("REG-004");
  });

  it("tier B requires co-approver", () => {
    expect(() =>
      assertWireGovernanceApproval({ amount: 500_000, currency: "JPY", approverId: "DemoCEO" })
    ).toThrow(/co-approver/);

    const result = assertWireGovernanceApproval({
      amount: 500_000,
      currency: "JPY",
      approverId: "DemoCEO",
      coApproverId: "CoCEO",
    });
    expect(result.tier).toBe("B");
  });

  it("tier C rejects CLI approval", () => {
    expect(() =>
      assertWireGovernanceApproval({
        amount: 2_000_000,
        currency: "JPY",
        approverId: "DemoCEO",
        coApproverId: "CoCEO",
      })
    ).toThrow(/board resolution/);
  });

  it("loadAuthorizedApprovers includes demo CEO from operators registry", () => {
    expect(loadAuthorizedApprovers()).toContain("DemoCEO");
  });
});
