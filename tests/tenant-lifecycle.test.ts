import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearTenantLifecycleCacheForTests,
  loadTenantLifecycle,
  operatorAllowedForLifecycleSso,
  saveTenantLifecycle,
} from "../src/lib/org/tenant-lifecycle.js";
import { setTenantId } from "../src/lib/tenant.js";
import type { OperatorRecord } from "../schemas/org/operator.js";

describe("tenant lifecycle", () => {
  beforeEach(() => {
    setTenantId("demo");
    clearTenantLifecycleCacheForTests();
  });

  afterEach(() => {
    clearTenantLifecycleCacheForTests();
  });

  it("defaults to active when file missing", () => {
    expect(loadTenantLifecycle().status).toBe("active");
  });

  it("restricts SSO during winding_down to ceo, approver, liquidator", () => {
    saveTenantLifecycle({
      version: "1",
      status: "winding_down",
      declared_at: "2026-01-01",
      declared_by_operator_id: "OP-001",
    });

    const ceo: OperatorRecord = {
      operator_id: "OP-001",
      display_name: "CEO",
      role: "ceo",
      status: "active",
      email: "ceo@malkk.com",
    };
    const operator: OperatorRecord = {
      operator_id: "OP-002",
      display_name: "Ops",
      role: "operator",
      status: "active",
      email: "ops@malkk.com",
    };
    const liquidator: OperatorRecord = {
      operator_id: "OP-LIQ-001",
      display_name: "Liquidator",
      role: "readonly",
      status: "active",
      email: "liquidator@malkk.com",
      guest_expires_at: "2099-12-31",
      seat_kind: "liquidator",
    };

    expect(operatorAllowedForLifecycleSso(ceo)).toBe(true);
    expect(operatorAllowedForLifecycleSso(liquidator)).toBe(true);
    expect(operatorAllowedForLifecycleSso(operator)).toBe(false);
  });
});
