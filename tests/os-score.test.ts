import { describe, it, expect } from "vitest";
import { computeOs99Score, PRODUCT_FRAMEWORK_SCORE } from "../src/lib/os-score.js";
import type { MaturityReport } from "../src/lib/maturity.js";

function mockMaturity(prep: number, ops: number, auto: number): MaturityReport {
  const mk = (id: "preparedness" | "operational" | "automation", pct: number) => ({
    id,
    label: id,
    score: pct,
    max: 100,
    pct,
    detail: "",
  });
  return {
    preparedness: mk("preparedness", prep),
    operational: mk("operational", ops),
    automation: mk("automation", auto),
    overall: Math.round((prep + ops + auto) / 3),
    grade: "A",
    recommendations: [],
  };
}

describe("os-score", () => {
  it("computes weighted composite", () => {
    const s = computeOs99Score(mockMaturity(97, 84, 100));
    const expected = Math.round(
      PRODUCT_FRAMEWORK_SCORE * 0.3 + 97 * 0.25 + 84 * 0.35 + 100 * 0.1
    );
    expect(s.composite).toBe(expected);
    expect(s.gapTo99).toBe(Math.max(0, 99 - expected));
  });
});
