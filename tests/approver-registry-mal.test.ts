import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { loadAuthorizedApprovers } from "../src/lib/jurisdiction/wire-governance/index.js";
import { assertWireApproval } from "../src/lib/org/approval-gate.js";

describe("mal approver registry (wire governance)", () => {
  beforeEach(() => setTenantId("mal"));

  it("loads authorized approvers from company.yaml", () => {
    const approvers = loadAuthorizedApprovers();
    expect(approvers.length).toBeGreaterThan(0);
  });

  it("tier A accepts representative director", () => {
    const approvers = loadAuthorizedApprovers();
    const result = assertWireApproval({
      amount: 85_000,
      currency: "JPY",
      approverId: approvers[0]!,
    });
    expect(result.tier).toBe("A");
  });
});
