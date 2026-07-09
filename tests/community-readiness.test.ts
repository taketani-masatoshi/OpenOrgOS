import { describe, it, expect } from "vitest";
import { computeCommunityReadiness } from "../src/lib/protocol/community-readiness.js";
import { computeOrgOsScore } from "../src/lib/os-score.js";
import { resolveEcoStrictCap, ECO_STRICT_CAP_STEWARD_PUBLISH, ECO_READINESS_CAP_COMMUNITY } from "../src/lib/protocol/eco-production-evidence.js";
import { exportCommunityProtocolBundle } from "../src/lib/protocol/community-export.js";

describe("community readiness", () => {
  it("scores steward-side C4 features above baseline 45", () => {
    const readiness = computeCommunityReadiness();
    expect(readiness.score).toBeGreaterThanOrEqual(90);
    expect(readiness.checks.some((c) => c.id === "trusted-operators-registry" && c.ok)).toBe(true);
    expect(readiness.checks.some((c) => c.id === "ci-protocol-validate-tenants" && c.ok)).toBe(true);
  });

  it("raises OrgOS ecosystem axis via dynamic scoring", () => {
    exportCommunityProtocolBundle();
    const readiness = computeCommunityReadiness();
    const score = computeOrgOsScore();
    expect(readiness.score).toBeGreaterThanOrEqual(ECO_READINESS_CAP_COMMUNITY);
    expect(score.checklist.ecosystem).toBeGreaterThanOrEqual(ECO_READINESS_CAP_COMMUNITY);
    expect(score.checklist.weighted).toBeGreaterThanOrEqual(99);
    expect(score.strict.ecosystem).toBeGreaterThanOrEqual(ECO_READINESS_CAP_COMMUNITY);
    expect(resolveEcoStrictCap()).toBeGreaterThanOrEqual(ECO_STRICT_CAP_STEWARD_PUBLISH);
    expect(score.strict.weighted).toBeGreaterThanOrEqual(90);
  });
});
