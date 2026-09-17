import { describe, expect, it } from "vitest";
import { computeAgentReadiness } from "../src/lib/agent-readiness.js";

describe("executive_steward orchestration readiness axis", () => {
  it("scores the orchestration axis in full", () => {
    const result = computeAgentReadiness("executive_steward");
    const orchestration = result.axes.find((axis) => axis.id === "orchestration");
    expect(orchestration).toBeDefined();
    expect(orchestration?.max).toBe(2);
    expect(orchestration?.score).toBe(2);
    // The agent's docs_paths are docs/reports/dashboard/ and
    // docs/reports/executive-notes/ — generated report dirs that .gitignore
    // keeps off the tip, so the data_sot, dashboard and tenant axes cannot be
    // full in a clean checkout.
    expect(result.pct).toBeGreaterThanOrEqual(83);
    expect(result.total).toBe(result.axes.reduce((sum, axis) => sum + axis.score, 0));
  });
});
