import { describe, it, expect } from "vitest";
import { computeCommunityReadiness } from "../src/lib/protocol/community-readiness.js";
import { computeOrgOsScore } from "../src/lib/os-score.js";

describe("community readiness", () => {
  it("scores steward-side C4 features above baseline 45", () => {
    const readiness = computeCommunityReadiness();
    expect(readiness.score).toBeGreaterThanOrEqual(90);
    expect(readiness.checks.some((c) => c.id === "trusted-operators-registry" && c.ok)).toBe(true);
    expect(readiness.checks.some((c) => c.id === "ci-protocol-validate-tenants" && c.ok)).toBe(true);
  });

  it("raises OrgOS ecosystem axis via dynamic scoring", () => {
    const score = computeOrgOsScore();
    expect(score.checklist.ecosystem).toBeGreaterThanOrEqual(90);
    expect(score.checklist.weighted).toBeGreaterThanOrEqual(99);
    expect(score.strict.ecosystem).toBeLessThanOrEqual(80);
    expect(score.strict.weighted).toBeGreaterThanOrEqual(90);
  });
});
