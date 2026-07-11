import { describe, it, expect, beforeEach } from "vitest";
import { resetAgentCatalogCache } from "../src/lib/agent-catalog.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  agentPromptPath,
  formatAgentPromptRef,
  formatSkillReference,
  buildPortableAgentPack,
  exportPortableAgents,
  loadAgentRegistryEntries,
} from "../src/lib/agent-portability.js";
import { loadSkillRegistry } from "../src/lib/skill-registry.js";

describe("agent-portability", () => {
  beforeEach(() => {
    setTenantId("mal");
    resetAgentCatalogCache();
  });

  it("formatAgentPromptRef portable includes path and cursor hint", () => {
    const ref = formatAgentPromptRef("finance", "portable");
    expect(ref).toContain("steward/core/agents/finance_agent.md");
    expect(ref).toContain("@steward/core/agents/finance_agent.md");
    expect(ref).toContain("orgos operator export");
  });

  it("agentPromptPath resolves known agents", () => {
    expect(agentPromptPath("secretary")).toBe("steward/core/agents/secretary_agent.md");
  });

  it("agentPromptPath resolves legacy module aliases to catalog owner path", () => {
    expect(agentPromptPath("property_rental")).toBe(agentPromptPath("operations"));
  });

  it("formatSkillReference portable includes path", () => {
    const skill = loadSkillRegistry().find((s) => s.runtime === "agent");
    expect(skill).toBeDefined();
    const ref = formatSkillReference(skill!, "portable");
    expect(ref).toContain("Skill:");
    expect(ref).toContain(skill!.file);
  });

  it("buildPortableAgentPack includes policy and agent body", () => {
    const pack = buildPortableAgentPack("finance");
    expect(pack).toContain("# OrgOS Agent Pack · finance");
    expect(pack).toContain("## 1. Operator Policy");
    expect(pack).toContain("# Finance Agent");
  });

  it(
    "exportPortableAgents writes core packs and mcp snippets",
    () => {
      const result = exportPortableAgents({ emit: "all" });
      expect(result.packs.length).toBeGreaterThanOrEqual(6);
      expect(result.indexPath).toBeDefined();
      expect(result.mcpPaths.length).toBe(2);
    },
    60_000
  );

  it("loadAgentRegistryEntries includes core agents", () => {
    const entries = loadAgentRegistryEntries();
    expect(entries.some((e) => e.id === "finance")).toBe(true);
    expect(entries.some((e) => e.id === "executive_steward")).toBe(true);
  });
});

describe("operator-policy sync", () => {
  it("syncOperatorPolicy emits dev-guide cursor rule", async () => {
    const { syncOperatorPolicy, TOOL_NEUTRAL_DEV_CURSOR_RULE } = await import(
      "../src/lib/operator-policy.js"
    );
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { ROOT_DIR } = await import("../src/lib/tenant.js");
    const paths = syncOperatorPolicy("dev-guide");
    expect(paths.devGuideRulePath).toBeDefined();
    expect(existsSync(join(ROOT_DIR, TOOL_NEUTRAL_DEV_CURSOR_RULE))).toBe(true);
  });

  it("syncEngineeringRules emits 00-09 cursor mirrors", async () => {
    const {
      syncEngineeringRules,
      validatePolicyMirrors,
      ENGINEERING_RULE_STEMS,
      assertEngineeringRulesComplete,
    } = await import("../src/lib/operator-policy.js");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { ROOT_DIR } = await import("../src/lib/tenant.js");

    assertEngineeringRulesComplete();
    const paths = syncEngineeringRules();
    expect(paths).toHaveLength(ENGINEERING_RULE_STEMS.length);
    for (const stem of ENGINEERING_RULE_STEMS) {
      const mdc = join(ROOT_DIR, ".cursor", "rules", `${stem}.mdc`);
      expect(existsSync(mdc)).toBe(true);
    }
    expect(validatePolicyMirrors()).toEqual([]);
  });
});
