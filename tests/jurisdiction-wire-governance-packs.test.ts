import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import {
  clearWireGovernanceCacheForTests,
  resolveJurisdictionApprovalPolicy,
} from "../src/lib/jurisdiction/wire-governance/index.js";
import {
  getWireGovernanceRegistryPath,
  resolveWireGovernancePackPath,
} from "../src/lib/jurisdiction/wire-governance/paths.js";
import { jurisdictionWireGovernanceRegistrySchema } from "../schemas/jurisdiction/wire-governance.js";

describe("jurisdiction wire governance packs", () => {
  beforeEach(() => {
    setTenantId("demo");
    clearWireGovernanceCacheForTests();
  });

  it("registry pins match pack file content", () => {
    const registry = jurisdictionWireGovernanceRegistrySchema.parse(
      YAML.parse(readFileSync(getWireGovernanceRegistryPath(), "utf-8"))
    );
    for (const entry of Object.values(registry.packs)) {
      const packPath = resolveWireGovernancePackPath(entry.path);
      const digest = createHash("sha256").update(readFileSync(packPath)).digest("hex");
      expect(digest).toBe(entry.pin);
    }
  });

  it("loads JP policy from split pack", () => {
    const policy = resolveJurisdictionApprovalPolicy();
    expect(policy.policy_ref).toBe("REG-004");
    expect(policy.currency).toBe("JPY");
  });
});
