import { describe, it, expect, beforeAll } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { computeAllAgentReadiness, computeAgentReadiness } from "../src/lib/agent-readiness.js";
import { listAgentCapabilities } from "../src/lib/agent-capability.js";
import { runAllAgentPulses } from "../src/lib/agent-pulse.js";

describe("agent readiness", () => {
  beforeAll(() => {
    setTenantId("acme");
    const pre = computeAllAgentReadiness();
    if (pre.some((r) => r.pct < 80)) {
      runAllAgentPulses({ suffix: "readiness-test" });
    }
  }, 120_000);

  it("manifest lists 47 core agents", () => {
    expect(listAgentCapabilities().length).toBe(47);
  });

  it("all agents score at least 90% on acme after pulse", () => {
    const results = computeAllAgentReadiness();
    expect(results.length).toBe(47);
    const below = results.filter((r) => r.pct < 90);
    if (below.length) {
      console.log(below.map((b) => `${b.agent_id}: ${b.pct}%`).join("\n"));
    }
    expect(below.length).toBe(0);
  }, 60_000);

  it("finance agent has dedicated skills reflected in readiness", () => {
    const r = computeAgentReadiness("finance");
    expect(r.pct).toBeGreaterThanOrEqual(80);
    const skillAxis = r.axes.find((a) => a.id === "skill_cli");
    expect(skillAxis?.score).toBeGreaterThanOrEqual(16);
  });
});
