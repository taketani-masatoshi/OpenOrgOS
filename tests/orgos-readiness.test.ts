import { describe, it, expect, afterEach } from "vitest";
import { computeOrgOsReadiness } from "../src/lib/protocol/orgos-readiness.js";
import { computeOrgOsStrictReadiness } from "../src/lib/protocol/orgos-readiness-strict.js";
import {
  computeOpenOrgOsCoreReadiness,
  computeOpenOrgOsCoreStrictReadiness,
  OPENORGOS_CORE_STRICT_CAP_TEST_FAILED,
  OPENORGOS_CORE_STRICT_CAP_UNVERIFIED,
} from "../src/lib/protocol/openorgos-core-readiness.js";
import { computeOrgOsScore, computeOpenOrgOsCoreScore } from "../src/lib/os-score.js";
import {
  clearTestSuiteStatus,
  writeTestSuiteFailed,
  writeTestSuitePassed,
} from "../src/lib/protocol/test-suite-status.js";

describe("orgos readiness scoring", () => {
  it("checklist score reflects artifact registry (high)", () => {
    const readiness = computeOrgOsReadiness();
    expect(readiness.weighted).toBeGreaterThanOrEqual(99);
  });

  it("strict score applies operational caps (lower than checklist)", () => {
    const checklist = computeOrgOsReadiness();
    const strict = computeOrgOsStrictReadiness();
    expect(strict.weighted).toBeLessThan(checklist.weighted);
    expect(strict.weighted).toBeGreaterThanOrEqual(90);
    expect(strict.interfaceAxis.score).toBeLessThanOrEqual(checklist.interfaceAxis.score);
  });

  it("computeOrgOsScore exposes both modes", () => {
    const score = computeOrgOsScore();
    expect(score.checklist.weighted).toBeGreaterThanOrEqual(99);
    expect(score.strict.weighted).toBeGreaterThanOrEqual(90);
    expect(score.strict.weighted).toBeLessThan(score.checklist.weighted);
  });
});

describe("openorgos core scoring", () => {
  afterEach(() => {
    clearTestSuiteStatus();
  });

  it("checklist core score is high when artifacts exist", () => {
    const core = computeOpenOrgOsCoreReadiness();
    expect(core.weighted).toBeGreaterThanOrEqual(99);
  });

  it("strict core score is capped when test suite unverified", () => {
    clearTestSuiteStatus();
    const checklist = computeOpenOrgOsCoreReadiness();
    const strict = computeOpenOrgOsCoreStrictReadiness();
    expect(strict.weighted).toBe(
      Math.min(checklist.weighted, OPENORGOS_CORE_STRICT_CAP_UNVERIFIED)
    );
    expect(strict.weighted).toBeLessThan(checklist.weighted);
  });

  it("strict core score drops when npm test last failed", () => {
    writeTestSuiteFailed("vitest");
    const checklist = computeOpenOrgOsCoreReadiness();
    const strict = computeOpenOrgOsCoreStrictReadiness();
    expect(strict.weighted).toBe(
      Math.min(checklist.weighted, OPENORGOS_CORE_STRICT_CAP_TEST_FAILED)
    );
  });

  it("strict core score follows checklist when npm test passed", () => {
    writeTestSuitePassed("vitest");
    const checklist = computeOpenOrgOsCoreReadiness();
    const strict = computeOpenOrgOsCoreStrictReadiness();
    expect(strict.weighted).toBe(checklist.weighted);
  });

  it("computeOpenOrgOsCoreScore exposes both modes", () => {
    clearTestSuiteStatus();
    const score = computeOpenOrgOsCoreScore();
    expect(score.checklist.weighted).toBeGreaterThanOrEqual(99);
    expect(score.strict.weighted).toBeLessThanOrEqual(OPENORGOS_CORE_STRICT_CAP_UNVERIFIED);
  });
});
