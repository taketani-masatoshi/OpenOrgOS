import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resetAgentCatalogCache } from "../src/lib/agent-catalog.js";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import {
  syncOperatorPolicy,
  syncEngineeringRules,
  validatePolicyMirrors,
  ENGINEERING_RULE_STEMS,
  assertEngineeringRulesComplete,
  TOOL_NEUTRAL_DEV_CURSOR_RULE,
} from "../src/lib/operator-policy.js";
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
    expect(pack).toContain("## 1b. Engineering Constitution");
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
  it("syncOperatorPolicy emits dev-guide cursor rule", () => {
    const paths = syncOperatorPolicy("dev-guide");
    expect(paths.devGuideRulePath).toBeDefined();
    expect(existsSync(join(ROOT_DIR, TOOL_NEUTRAL_DEV_CURSOR_RULE))).toBe(true);
  });

  it("syncEngineeringRules emits 00-09 cursor mirrors", () => {
    assertEngineeringRulesComplete();
    const paths = syncEngineeringRules();
    expect(paths).toHaveLength(ENGINEERING_RULE_STEMS.length);
    for (const stem of ENGINEERING_RULE_STEMS) {
      const mdc = join(ROOT_DIR, ".cursor", "rules", `${stem}.mdc`);
      expect(existsSync(mdc)).toBe(true);
    }
    const engineeringIssues = validatePolicyMirrors().filter((issue) =>
      ENGINEERING_RULE_STEMS.some((stem) => issue.includes(`${stem}.mdc`))
    );
    expect(engineeringIssues).toEqual([]);
  });

  it("rewriteEngineeringBodyLinksForCursorMirror fixes parent-relative links", async () => {
    const { rewriteEngineeringBodyLinksForCursorMirror } = await import(
      "../src/lib/operator-policy.js"
    );
    const out = rewriteEngineeringBodyLinksForCursorMirror(
      "[index](../openorgos-engineering-constitution.md) · [core](../../core/agents/)"
    );
    expect(out).toContain("](steward/rules/openorgos-engineering-constitution.md)");
    expect(out).toContain("](steward/core/agents/");
  });

  it("validatePolicyMirrors detects stale engineering mdc", () => {
    syncEngineeringRules();
    const mdcPath = join(ROOT_DIR, ".cursor", "rules", "00-engineering-constitution.mdc");
    const original = readFileSync(mdcPath, "utf-8");
    writeFileSync(mdcPath, `${original}\n<!-- stale-test -->\n`, "utf-8");
    try {
      const issues = validatePolicyMirrors();
      expect(
        issues.some((m) => m.includes("00-engineering-constitution.mdc") && m.includes("stale"))
      ).toBe(true);
    } finally {
      writeFileSync(mdcPath, original, "utf-8");
    }
  });
});
