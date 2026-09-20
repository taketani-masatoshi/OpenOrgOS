import { describe, expect, it } from "vitest";
import { computeAgentReadiness } from "../src/lib/agent-readiness.js";

describe("executive_steward orchestration readiness axis", () => {
  it("scores the orchestration axis in full", () => {
    const result = computeAgentReadiness("executive_steward");
    const orchestration = result.axes.find((axis) => axis.id === "orchestration");
    expect(orchestration).toBeDefined();
    expect(orchestration?.max).toBe(2);
    expect(orchestration?.score).toBe(2);
    // Generated report dirs under docs/reports/ are gitignored, so data_sot /
    // dashboard / tenant axes stay partial on a clean checkout. Do not pin pct.
    expect(result.total).toBe(result.axes.reduce((sum, axis) => sum + axis.score, 0));
  });
});
