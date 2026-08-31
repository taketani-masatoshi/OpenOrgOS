import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { validateAgentActivationContract } from "../src/lib/agent-activation-verify.js";
import { isAgentActive, listCatalogAgents, resolveAgentId } from "../src/lib/agent-catalog.js";
import {
  clearTaskProfile,
  listActiveTenantAgents,
  loadTenantAgentRoster,
  writeTaskProfileAgents,
} from "../src/lib/agent-roster.js";
import { listPulseEligibleAgents } from "../src/lib/agent-pulse.js";
import { DEFAULT_CORE_OPERATIONAL_AGENTS } from "../src/lib/tenant-roster-bootstrap.js";
import { matchRoutes } from "../src/lib/routing.js";

describe("agent activation contract", () => {
  beforeAll(() => {
    setTenantId("acme");
  });

  it("activation contract passes for acme tenant", () => {
    expect(validateAgentActivationContract({ allTenants: false })).toEqual([]);
  });

  it("acme roster yaml drives effective activation (selective load)", () => {
    const loaded = loadTenantAgentRoster();
    expect(loaded.exists).toBe(true);
    const active = new Set(listActiveTenantAgents("operational"));
    for (const id of loaded.roster.profiles.operational) {
      const resolved = resolveAgentId(id) ?? id;
      expect(active.has(resolved as never)).toBe(true);
    }
    expect(active.size).toBeLessThan(
      listCatalogAgents().filter((agent) => agent.status === "active").length
    );
    expect(active.has("finance")).toBe(true);
  });

  it("task profile narrows active agents when set", () => {
    clearTaskProfile();
    const before = listActiveTenantAgents("task").length;
    writeTaskProfileAgents(["finance", "secretary"]);
    const taskActive = listActiveTenantAgents("task");
    expect(taskActive).toEqual(["finance", "secretary"]);
    expect(isAgentActive("operations", { profile: "task" })).toBe(false);
    expect(isAgentActive("finance", { profile: "task" })).toBe(true);
    clearTaskProfile();
    expect(listActiveTenantAgents("task").length).toBeGreaterThanOrEqual(before);
  });

  it("pulse scope is bounded by active roster", () => {
    const active = new Set(listActiveTenantAgents("operational"));
    const pulseEligible = listPulseEligibleAgents();
    expect(pulseEligible.every((id) => active.has(id))).toBe(true);
    const catalogOps = listCatalogAgents().filter(
      (agent) => agent.status === "active" && agent.class !== "advisor"
    ).length;
    expect(pulseEligible.length).toBeLessThanOrEqual(catalogOps);
  });

  it("inactive agent routes expose enable guidance", () => {
    const matches = matchRoutes({ text: "税務申告", profile: "operational" });
    const tax = matches.find((m) => m.route.agent === "tax");
    if (!tax) return;
    if (isAgentActive("tax", { profile: "operational" })) return;
    expect(tax.moduleEnabled).toBe(false);
    expect(tax.blockedReasons.some((r) => r.includes("roster enable"))).toBe(true);
  });

  it("unconfigured tenants fall back to core-only, not full catalog", () => {
    const previousWorkspace = process.env.ORGOS_WORKSPACE;
    const workspace = mkdtempSync(join(tmpdir(), "orgos-unconfigured-tenant-"));
    const tenantId = "unconfigured-tenant";
    mkdirSync(join(workspace, "tenants", tenantId), { recursive: true });
    writeFileSync(
      join(workspace, "tenants", tenantId, "tenant.yaml"),
      `id: ${tenantId}\nname: Unconfigured\nlifecycle: skeleton\njurisdiction: JP\nlocale: ja-JP\ndefault_currency: JPY\n`,
      "utf-8"
    );
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    try {
      setTenantId(tenantId);
      const active = listActiveTenantAgents("operational");
      expect(active.length).toBeLessThanOrEqual(DEFAULT_CORE_OPERATIONAL_AGENTS.length);
      for (const id of DEFAULT_CORE_OPERATIONAL_AGENTS) {
        expect(active).toContain(id);
      }
      expect(isAgentActive("coo", { profile: "operational" })).toBe(false);
    } finally {
      if (previousWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
      else process.env.ORGOS_WORKSPACE = previousWorkspace;
      refreshOrgOsPaths();
      rmSync(workspace, { recursive: true, force: true });
      setTenantId("acme");
    }
  });
});
