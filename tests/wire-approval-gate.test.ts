import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  assertOrgApprovalGate,
  resolveOrgApprovalTier,
} from "../src/lib/org/approval-gate.js";

describe("org approval gate (core → jurisdiction)", () => {
  beforeEach(() => setTenantId("demo"));

  it("delegates tier resolution to jurisdiction module", () => {
    expect(resolveOrgApprovalTier(50_000, "JPY")).toBe("A");
    expect(resolveOrgApprovalTier(500_000, "JPY")).toBe("B");
  });

  it("assertOrgApprovalGate returns jurisdiction policy_ref", () => {
    const result = assertOrgApprovalGate({
      amount: 85_000,
      currency: "JPY",
      approverId: "段燕燕",
    });
    expect(result.tier).toBe("A");
    expect(result.policyRef).toMatch(/^REG-/);
  });
});
