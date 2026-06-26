import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  assertReg004Approval,
  resolveReg004Tier,
  loadAuthorizedApprovers,
} from "../src/lib/protocol/approval-policy.js";

describe("REG-004 approval policy", () => {
  beforeEach(() => setTenantId("demo"));

  it("resolves tiers by JPY amount (JP jurisdiction)", () => {
    expect(resolveReg004Tier(50_000, "JPY")).toBe("A");
    expect(resolveReg004Tier(500_000, "JPY")).toBe("B");
    expect(resolveReg004Tier(2_000_000, "JPY")).toBe("C");
  });

  it("tier A accepts single approver when company list empty (demo skeleton)", () => {
    const result = assertReg004Approval({
      amount: 85_000,
      currency: "JPY",
      approverId: "段燕燕",
    });
    expect(result.tier).toBe("A");
  });

  it("tier B requires co-approver", () => {
    expect(() =>
      assertReg004Approval({ amount: 500_000, currency: "JPY", approverId: "段燕燕" })
    ).toThrow(/co-approver/);

    const result = assertReg004Approval({
      amount: 500_000,
      currency: "JPY",
      approverId: "段燕燕",
      coApproverId: "宮城万貴子",
    });
    expect(result.tier).toBe("B");
  });

  it("tier C rejects CLI approval", () => {
    expect(() =>
      assertReg004Approval({
        amount: 2_000_000,
        currency: "JPY",
        approverId: "段燕燕",
        coApproverId: "宮城万貴子",
      })
    ).toThrow(/board resolution/);
  });

  it("loadAuthorizedApprovers returns empty for demo skeleton company", () => {
    expect(loadAuthorizedApprovers()).toEqual([]);
  });
});
