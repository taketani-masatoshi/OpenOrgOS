import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  computeAgentReadiness,
  computeAgentReadinessProfile,
} from "../src/lib/agent-readiness.js";
import { getCatalogAgent, listCatalogAgents } from "../src/lib/agent-catalog.js";
import { listActiveTenantAgents } from "../src/lib/agent-roster.js";

describe("agent readiness profiles", () => {
  beforeAll(() => {
    setTenantId("acme");
  });

  it("operational profile scores only active roster agents", () => {
    const results = computeAgentReadinessProfile("operational");
    const active = new Set(listActiveTenantAgents("operational"));
    expect(results.every((result) => active.has(result.agent_id))).toBe(true);
    expect(results.every((result) => result.profile === "operational")).toBe(true);
  });

  it("advisor profile does not require tenant paths", () => {
    const guide = computeAgentReadiness("platform_guide");
    expect(guide.profile).toBe("advisor");
    const tenantAxis = guide.axes.find((axis) => axis.id === "tenant");
    expect(tenantAxis?.detail).toContain("advisor");
    const evidence = guide.axes.find((axis) => axis.id === "test");
    expect(evidence?.detail).toContain("boundary:");
  });

  it("bootstrap profile uses reduced axis set", () => {
    const bootstrapAgents = listCatalogAgents().filter(
      (agent) => agent.readiness_profile === "bootstrap"
    );
    if (bootstrapAgents.length === 0) return;
    const result = computeAgentReadiness(bootstrapAgents[0]!.id);
    expect(result.profile).toBe("bootstrap");
    expect(result.axes.length).toBeLessThan(7);
  });

  it("advisor agents declare safe boundaries in catalog", () => {
    for (const agent of listCatalogAgents().filter((entry) => entry.class === "advisor")) {
      expect(agent.auto_route).toBe(false);
      expect(agent.auto_pulse).toBe(false);
      expect(agent.access.write.length).toBe(0);
      expect(getCatalogAgent(agent.id)?.class).toBe("advisor");
    }
  });
});
