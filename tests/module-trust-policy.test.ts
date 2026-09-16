import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  isThirdPartyModuleExecutionAllowed,
  maxTrustTierWithoutSandbox,
  runModuleTrustPolicyChecks,
  moduleTrustPolicySummary,
} from "../src/lib/module-trust-policy.js";
import { setTenantId } from "../src/lib/tenant.js";

const TEST_TENANT = "_module_trust_test";
const TENANT_DIR = join(process.cwd(), "tenants", TEST_TENANT);

function writeModulesYaml(modules: Record<string, unknown>[]) {
  mkdirSync(join(TENANT_DIR, "data", "org"), { recursive: true });
  writeFileSync(
    join(TENANT_DIR, "modules.yaml"),
    YAML.stringify({
      modules: modules.map((m) => ({
        enabled: false,
        agent: "travel_booking",
        ...m,
      })),
    })
  );
}

describe("module-trust-policy", () => {
  const prevTenant = process.env.ORGOS_TENANT;
  const prevAllow = process.env.ORGOS_ALLOW_THIRD_PARTY_MODULES;

  beforeEach(() => {
    mkdirSync(TENANT_DIR, { recursive: true });
    writeFileSync(join(TENANT_DIR, "tenant.yaml"), YAML.stringify({ id: TEST_TENANT, name: "Test" }));
    setTenantId(TEST_TENANT);
  });

  afterEach(() => {
    rmSync(TENANT_DIR, { recursive: true, force: true });
    if (prevTenant) process.env.ORGOS_TENANT = prevTenant;
    else delete process.env.ORGOS_TENANT;
    if (prevAllow) process.env.ORGOS_ALLOW_THIRD_PARTY_MODULES = prevAllow;
    else delete process.env.ORGOS_ALLOW_THIRD_PARTY_MODULES;
    setTenantId("mal");
  });

  it("blocks non-internal trust_tier by default", () => {
    writeModulesYaml([{ id: "test-mod", trust_tier: "reviewed" }]);
    const issues = runModuleTrustPolicyChecks();
    expect(issues.some((i) => i.message.includes("trust_tier") && i.message.includes("reviewed"))).toBe(
      true
    );
  });

  it("allows internal trust_tier", () => {
    writeModulesYaml([{ id: "test-mod", trust_tier: "internal" }]);
    const issues = runModuleTrustPolicyChecks().filter((i) => i.message.includes("trust_tier"));
    expect(issues).toHaveLength(0);
  });

  it("blocks marketplace artifact fields", () => {
    writeModulesYaml([{ id: "test-mod", artifact_url: "https://example.com/mod.wasm" }]);
    const issues = runModuleTrustPolicyChecks();
    expect(issues.some((i) => i.message.includes("artifact_url"))).toBe(true);
  });

  it("respects ORGOS_ALLOW_THIRD_PARTY_MODULES for invited tier", () => {
    process.env.ORGOS_ALLOW_THIRD_PARTY_MODULES = "1";
    expect(isThirdPartyModuleExecutionAllowed()).toBe(true);
    expect(maxTrustTierWithoutSandbox()).toBe("invited");

    writeModulesYaml([{ id: "test-mod", trust_tier: "invited" }]);
    const issues = runModuleTrustPolicyChecks().filter((i) => i.message.includes("trust_tier"));
    expect(issues).toHaveLength(0);
  });

  it("exports policy summary", () => {
    expect(moduleTrustPolicySummary()).toContain("phase_1_internal");
    expect(moduleTrustPolicySummary()).toContain("third_party_execution: blocked");
  });
});
