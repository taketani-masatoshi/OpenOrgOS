import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { requireCliOperator, setCliOperatorContext } from "../src/lib/console-auth/cli-operator.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";

describe("cli operator auth", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    setCliOperatorContext(undefined);
    delete process.env.ORGOS_ENV;
    delete process.env.ORGOS_TENANT;
    delete process.env.STEWARD_OPERATOR_AUTH;
    delete process.env.ORGOS_OPERATOR_KEY;
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("allows mutation without key when auth bypassed", () => {
    process.env.ORGOS_ENV = "development";
    process.env.ORGOS_TENANT = "demo";
    const auth = requireCliOperator({ permission: "escalate:run", command: "escalate run" });
    expect(auth.record.operator_id).toBe("dev-bypass");
  });

  it("requires operator id when auth enabled", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    expect(() => requireCliOperator({ permission: "escalate:run", command: "escalate run" })).toThrow(
      /--operator-id/
    );
  });

  it("authenticates with operator id and key", () => {
    process.env.STEWARD_OPERATOR_AUTH = "1";
    process.env.ORGOS_OPERATOR_KEY = "demo-operator-key-2";
    const auth = requireCliOperator({
      operatorId: "OP-002",
      permission: "escalate:run",
      command: "escalate run",
    });
    expect(auth.record.operator_id).toBe("OP-002");
  });
});
