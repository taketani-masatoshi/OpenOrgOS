import { describe, it, expect } from "vitest";
import {
  validateAgentDocsDrift,
  validateOrgChartDrift,
  validateAgentDocsGeneratedDrift,
  ORG_CHART_SIXTEEN_ROLE_IDS,
} from "../src/lib/agent-docs-sync.js";
import { resolveAgentId } from "../src/lib/agent-catalog.js";

describe("agent docs drift", () => {
  it("org-chart sixteen role ids exist in catalog", () => {
    for (const id of ORG_CHART_SIXTEEN_ROLE_IDS) {
      expect(resolveAgentId(id)).toBeTruthy();
    }
  });

  it("generated catalog sections are current", () => {
    expect(validateAgentDocsGeneratedDrift()).toEqual([]);
  });

  it("org-chart and steward roster docs match catalog references", () => {
    const issues = validateAgentDocsDrift();
    if (issues.length) console.log(issues.join("\n"));
    expect(issues).toEqual([]);
  });

  it("org-chart drift check passes standalone", () => {
    expect(validateOrgChartDrift()).toEqual([]);
  });
});
