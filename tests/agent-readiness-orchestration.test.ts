import { describe, expect, it } from "vitest";
import { computeAgentReadiness } from "../src/lib/agent-readiness.js";

describe("executive_steward orchestration readiness axis", () => {
  it("includes orchestration axis and reaches 100%", () => {
    const result = computeAgentReadiness("executive_steward");
    const orchestration = result.axes.find((axis) => axis.id === "orchestration");
    expect(orchestration).toBeDefined();
    expect(orchestration?.max).toBe(2);
    expect(orchestration?.score).toBe(2);
    expect(result.pct).toBe(100);
    expect(result.total).toBe(result.axes.reduce((sum, axis) => sum + axis.max, 0));
  });
});
