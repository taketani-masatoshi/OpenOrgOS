import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { loadAuthorizedApprovers, assertReg004Approval } from "../src/lib/protocol/approval-policy.js";

describe("REG-004 approver registry (mal tenant)", () => {
  beforeEach(() => setTenantId("mal"));

  it("loads representative directors from company.yaml", () => {
    const approvers = loadAuthorizedApprovers();
    expect(approvers).toContain("段燕燕");
    expect(approvers).toContain("宮城万貴子");
  });

  it("rejects unauthorized approver name", () => {
    expect(() =>
      assertReg004Approval({
        amount: 85_000,
        currency: "JPY",
        approverId: "未登録者",
      })
    ).toThrow(/not authorized/);
  });
});
