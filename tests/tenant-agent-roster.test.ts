import { describe, it, expect } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  loadTenantAgentRoster,
  validateTenantAgentRoster,
} from "../src/lib/agent-roster.js";
import { readTenantAgentRosterState } from "../src/lib/tenant-roster-load.js";
import { validateLegacyRosterFiles } from "../src/lib/tenant-roster-load.js";

describe("tenant agent roster migration", () => {
  it("mal has agents.yaml migrated from legacy core/modules", () => {
    setTenantId("mal");
    const loaded = loadTenantAgentRoster();
    expect(loaded.source).toBe("agents.yaml");
    expect(loaded.roster.profiles.operational).toContain("executive_steward");
    expect(loaded.roster.profiles.operational).toContain("secretary");
    expect(loaded.roster.profiles.operational).toContain("finance");
    expect(loaded.roster.profiles.operational).toContain("operations");
    expect(validateTenantAgentRoster(loaded.roster)).toEqual([]);
  });

  it("legacy agents-enabled.yaml is not auto-loaded (migrate CLI only)", () => {
    setTenantId("mal");
    const state = readTenantAgentRosterState();
    expect(state.source).toBe("agents.yaml");
  });

  it("mal has no legacy agents-enabled.yaml on disk", () => {
    setTenantId("mal");
    expect(validateLegacyRosterFiles()).toEqual([]);
  });
});
