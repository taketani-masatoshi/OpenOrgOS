import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  authenticateOperator,
  authenticateOperatorByKey,
  isOperatorAuthRequired,
  resolveOperatorPermissions,
} from "../src/lib/console-auth/operator-rbac.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { requireCliSchedulingApproval } from "../src/lib/console-auth/cli-operator.js";

describe("operator rbac", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    delete process.env.STEWARD_OPERATOR_AUTH;
    delete process.env.ORGOS_ENV;
    delete process.env.ORGOS_OPERATOR_KEY;
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("resolves ceo permissions from registry", () => {
    const perms = resolveOperatorPermissions({
      operator_id: "OP-001",
      display_name: "CEO",
      role: "ceo",
      status: "active",
    });
    expect(perms).toContain("chat:approve");
    expect(perms).toContain("scheduling:approve");
    expect(perms).toContain("scheduling:write");
    expect(perms).toContain("agent:dispatch");
  });

  it("authenticates operator with demo key", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    const auth = authenticateOperator({
      operatorId: "OP-002",
      key: "demo-operator-key-2",
    });
    expect("error" in auth).toBe(false);
    if (!("error" in auth)) {
      expect(auth.record.operator_id).toBe("OP-002");
      expect(auth.permissions).toContain("agent:dispatch");
      expect(auth.permissions).toContain("scheduling:write");
      expect(auth.permissions).not.toContain("scheduling:approve");
      expect(auth.permissions).not.toContain("chat:approve");
    }
  });

  it("rejects invalid operator key when auth required", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    const auth = authenticateOperator({ operatorId: "OP-002", key: "wrong-key" });
    expect(auth).toEqual({ error: "Invalid operator key" });
  });

  it("bypasses auth in development demo tenant", () => {
    process.env.ORGOS_ENV = "development";
    process.env.ORGOS_TENANT = "demo";
    expect(isOperatorAuthRequired()).toBe(false);
  });

  it("resolves operator by bearer key", () => {
    const auth = authenticateOperatorByKey("demo-operator-key");
    expect(auth?.record.operator_id).toBe("OP-001");
  });

  it("does not allow dev bypass for final scheduling confirmation", () => {
    process.env.STEWARD_OPERATOR_AUTH = "0";
    expect(() => requireCliSchedulingApproval("executive scheduling confirm")).toThrow(
      /Dev bypass is not allowed/
    );
  });
});
