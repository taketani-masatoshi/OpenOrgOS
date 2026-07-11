import { describe, it, expect } from "vitest";
import { loadAgentCatalog, validateAgentCatalog, isAgentActive } from "../src/lib/agent-catalog.js";
import { isFieldAgent, canReceiveImplementOrder } from "../src/lib/agent-reporting.js";
import type { AgentId } from "../schemas/classification.js";

describe("agent authority graph", () => {
  it("catalog validates without issues", () => {
    expect(validateAgentCatalog()).toEqual([]);
  });

  it("platform_guide is advisor with no implement dispatch", () => {
    const agent = loadAgentCatalog().agents.platform_guide;
    expect(agent.class).toBe("advisor");
    expect(agent.dispatch_modes).toEqual(["consult"]);
    expect(agent.auto_route).toBe(false);
    expect(agent.auto_pulse).toBe(false);
    expect(agent.access.write).toEqual([]);
  });

  it("platform_guide is inactive in operational profile", () => {
    expect(isAgentActive("platform_guide" as AgentId, { profile: "operational", mode: "consult" })).toBe(
      false
    );
  });

  it("rejects implement orders to advisor and hub agents", () => {
    expect(isFieldAgent("platform_guide")).toBe(false);
    expect(isFieldAgent("coo")).toBe(false);
    expect(isFieldAgent("executive_steward")).toBe(false);
    expect(canReceiveImplementOrder("platform_guide")).toBe(false);
    expect(canReceiveImplementOrder("engineering")).toBe(true);
  });

  it("reports_to graph has no cycles", () => {
    const catalog = loadAgentCatalog();
    for (const id of Object.keys(catalog.agents)) {
      const seen = new Set<string>();
      let cursor: string | undefined = id;
      while (cursor) {
        expect(seen.has(cursor)).toBe(false);
        seen.add(cursor);
        cursor = catalog.agents[cursor]?.reports_to;
      }
    }
  });
});
