import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  runSecurityChecks,
  listTenantsMissingOperatorRegistry,
} from "../src/lib/security-validate.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";

describe("security validate", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    delete process.env.ORGOS_ENV;
    delete process.env.STEWARD_OPERATOR_AUTH;
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("passes registry checks for demo tenant fixture", () => {
    const errors = runSecurityChecks().filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("has no tenants missing operator registry", () => {
    expect(listTenantsMissingOperatorRegistry()).toEqual([]);
  });
});
