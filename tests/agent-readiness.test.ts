import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { computeAllAgentReadiness, computeAgentReadiness } from "../src/lib/agent-readiness.js";
import { listOperationalCapabilities } from "../src/lib/agent-capability.js";
import { listCatalogAgents } from "../src/lib/agent-catalog.js";

describe("agent readiness", () => {
  const operationalCount = listCatalogAgents().filter(
    (a) => a.class !== "advisor" && a.status !== "planned"
  ).length;

  beforeAll(() => {
    setTenantId("acme");
  });

  it("operational manifest matches catalog (excludes advisors)", () => {
    expect(listOperationalCapabilities().length).toBe(operationalCount);
  });

  it("all operational agents expose evidence, activation, and boundary checks", () => {
    const results = computeAllAgentReadiness();
    expect(results.length).toBe(operationalCount);
    for (const result of results) {
      expect(result.profile).toBe("operational");
      const evidence = result.axes.find((axis) => axis.id === "test");
      expect(evidence?.detail).toContain("test");
      expect(evidence?.detail).toContain("activation:");
      expect(evidence?.detail).toContain("boundary:");
      expect(evidence?.detail).not.toContain("manifest");
    }
  }, 60_000);

  it("finance agent has dedicated skills reflected in readiness", () => {
    const r = computeAgentReadiness("finance");
    expect(r.pct).toBeGreaterThanOrEqual(80);
    const skillAxis = r.axes.find((a) => a.id === "skill_cli");
    expect(skillAxis?.score).toBeGreaterThanOrEqual(16);
  });

  it("platform_guide advisor profile does not require tenant data", () => {
    const r = computeAgentReadiness("platform_guide");
    expect(r.pct).toBeGreaterThanOrEqual(80);
    const tenantAxis = r.axes.find((a) => a.id === "tenant");
    expect(tenantAxis?.detail).toContain("advisor");
  });
});
