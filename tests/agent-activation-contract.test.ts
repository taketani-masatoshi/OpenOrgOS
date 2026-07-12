import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { validateAgentActivationContract } from "../src/lib/agent-activation-verify.js";
import { isAgentActive, listCatalogAgents } from "../src/lib/agent-catalog.js";
import {
  clearTaskProfile,
  listActiveTenantAgents,
  loadTenantAgentRoster,
  writeTaskProfileAgents,
} from "../src/lib/agent-roster.js";
import { listPulseEligibleAgents } from "../src/lib/agent-pulse.js";

describe("agent activation contract", () => {
  beforeAll(() => {
    setTenantId("acme");
  });

  it("activation contract passes for acme tenant", () => {
    expect(validateAgentActivationContract()).toEqual([]);
  });

  it("acme roster yaml drives effective activation (selective load)", () => {
    const loaded = loadTenantAgentRoster();
    expect(loaded.exists).toBe(true);
    const yamlCount = loaded.roster.profiles.operational.length;
    const active = listActiveTenantAgents("operational");
    expect(active.length).toBe(yamlCount);
    expect(active.length).toBeLessThan(
      listCatalogAgents().filter((agent) => agent.status === "active").length
    );
    expect(active).toContain("finance");
    expect(active).not.toContain("coo");
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
});
