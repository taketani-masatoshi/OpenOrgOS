import { describe, expect, it } from "vitest";
import {
  bootstrapAllTenantAgentRosters,
  listTenantsMissingAgentRoster,
} from "../src/lib/agent-roster.js";
import { listTenantsWithLegacyAgentRoster } from "../src/lib/tenant-roster-bootstrap.js";

describe("tenant agent roster coverage", () => {
  it("every tenant can be provisioned with agents.yaml", () => {
    const missing = listTenantsMissingAgentRoster();
    if (missing.length) {
      const results = bootstrapAllTenantAgentRosters({ force: false });
      const errors = results.filter((r) => r.action === "error");
      expect(errors).toEqual([]);
    }
    expect(listTenantsMissingAgentRoster()).toEqual([]);
  });

  it("no tenant uses legacy agents-enabled.yaml", () => {
    expect(listTenantsWithLegacyAgentRoster()).toEqual([]);
  });
});
