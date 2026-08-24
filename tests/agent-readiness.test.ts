import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { computeAllAgentReadiness, computeAgentReadiness } from "../src/lib/agent-readiness.js";
import { listActiveTenantAgents } from "../src/lib/agent-roster.js";
import { getCatalogAgent } from "../src/lib/agent-catalog.js";

describe("agent readiness", () => {
  let operationalCount = 0;

  beforeAll(() => {
    setTenantId("acme");
    operationalCount = listActiveTenantAgents("operational").filter((id) => {
      const agent = getCatalogAgent(id);
      return agent?.class !== "advisor" && agent?.status !== "planned";
    }).length;
  });

  it("operational readiness matches active roster (excludes advisors)", () => {
    expect(computeAllAgentReadiness().length).toBe(operationalCount);
  });

  it("all operational agents expose evidence, activation, and boundary checks", () => {
    const results = computeAllAgentReadiness();
    expect(results.length).toBe(operationalCount);
    for (const result of results) {
      expect(result.profile).toBe("operational");
      const evidence = result.axes.find((axis) => axis.id === "test");
      expect(evidence?.detail).toContain("activation:");
      expect(evidence?.detail).toContain("skills:");
      expect(evidence?.detail).not.toContain("test suite");
    }
  }, 60_000);

  it("finance agent has dedicated skills reflected in readiness", () => {
    const r = computeAgentReadiness("finance");
    expect(r.pct).toBeGreaterThanOrEqual(80);
    const skillAxis = r.axes.find((a) => a.id === "skill_cli");
    expect(skillAxis?.score).toBeGreaterThanOrEqual(16);
  });

  it("sales_lead agent meets readiness threshold on mal tenant", () => {
    setTenantId("mal");
    const r = computeAgentReadiness("sales_lead");
    expect(r.pct).toBeGreaterThanOrEqual(90);
    const skillAxis = r.axes.find((a) => a.id === "skill_cli");
    expect(skillAxis?.score).toBeGreaterThanOrEqual(14);
  });

  it("sales_inbound agent reaches full readiness on mal tenant", () => {
    setTenantId("mal");
    const r = computeAgentReadiness("sales_inbound");
    expect(r.pct).toBe(100);
    expect(r.axes.find((a) => a.id === "skill_cli")?.score).toBe(20);
  });

  it("cli-only agents with two or more skills earn full skill_cli execution depth", () => {
    setTenantId("mal");
    for (const id of ["compliance", "tax", "medical_device_regulatory", "sales_lead"] as const) {
      const skillAxis = computeAgentReadiness(id).axes.find((a) => a.id === "skill_cli");
      expect(skillAxis?.score, `${id} skill_cli`).toBe(20);
    }
  });

  it("whole sales line is roster-active and above threshold on mal tenant", () => {
    setTenantId("mal");
    for (const id of [
      "sales_lead",
      "sales_inbound",
      "sales_outbound",
      "customer_success",
    ] as const) {
      const r = computeAgentReadiness(id);
      expect(r.pct, `${id} readiness`).toBeGreaterThanOrEqual(90);
      expect(
        r.axes.find((a) => a.id === "test")?.detail,
        `${id} activation`,
      ).toContain("activation: OK");
    }
  });

  it("platform_guide advisor profile does not require tenant data", () => {
    const r = computeAgentReadiness("platform_guide");
    expect(r.pct).toBeGreaterThanOrEqual(80);
    const tenantAxis = r.axes.find((a) => a.id === "tenant");
    expect(tenantAxis?.detail).toContain("advisor");
  });
});
