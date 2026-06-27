import { describe, it, expect } from "vitest";
import { computeCommunityReadiness } from "../src/lib/protocol/community-readiness.js";
import { computeOrgOsScore } from "../src/lib/os-score.js";

describe("community readiness", () => {
  it("scores steward-side C4 features above baseline 45", () => {
    const readiness = computeCommunityReadiness();
    expect(readiness.score).toBeGreaterThanOrEqual(75);
    expect(readiness.checks.some((c) => c.id === "trusted-operators-registry" && c.ok)).toBe(true);
  });

  it("raises OrgOS ecosystem axis via dynamic scoring", () => {
    const score = computeOrgOsScore();
    expect(score.ecosystem).toBeGreaterThanOrEqual(75);
    expect(score.weighted).toBeGreaterThanOrEqual(89);
  });
});
