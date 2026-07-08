import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  assertActiveTenant,
  assertIntraOrgAgentTarget,
  tenantDispatchRoot,
} from "../src/lib/org-boundary.js";

describe("org boundary", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("allows intra-org agent targets", () => {
    expect(() => assertIntraOrgAgentTarget("finance", "test")).not.toThrow();
  });

  it("blocks cross-org agent targets", () => {
    expect(() => assertIntraOrgAgentTarget("peer:mal", "test")).toThrow(/cross-org/);
    expect(() => assertIntraOrgAgentTarget("steward://tenant/mal", "test")).toThrow(/cross-org/);
  });

  it("asserts active tenant match", () => {
    expect(() => assertActiveTenant("demo", "test")).not.toThrow();
    expect(() => assertActiveTenant("mal", "test")).toThrow(/tenant mismatch/);
  });

  it("jails dispatch root to tenant directory", () => {
    const root = tenantDispatchRoot();
    expect(root.endsWith("/tenants/demo")).toBe(true);
  });
});
