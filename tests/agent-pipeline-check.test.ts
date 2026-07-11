import { describe, expect, it } from "vitest";
import { validateGeneratedArtifacts } from "../src/lib/generated-artifacts.js";
import { listTenantsWithLegacyAgentRoster } from "../src/lib/tenant-roster-bootstrap.js";

describe("agent pipeline check prerequisites", () => {
  it("generated agent artifacts are current", () => {
    const issues = validateGeneratedArtifacts().filter(
      (issue) =>
        issue.includes("agent-ids") ||
        issue.includes("capability") ||
        issue.includes("generated section")
    );
    expect(issues).toEqual([]);
  });

  it("no tenant retains legacy agents-enabled.yaml", () => {
    expect(listTenantsWithLegacyAgentRoster()).toEqual([]);
  });
});
