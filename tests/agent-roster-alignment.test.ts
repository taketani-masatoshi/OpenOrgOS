import { describe, expect, it, beforeAll } from "vitest";
import { tenantAgentRosterSchema } from "../schemas/agent-roster.js";
import { validateAgentAlignment } from "../src/lib/agent-alignment.js";
import { validateTenantAgentRoster } from "../src/lib/agent-roster.js";
import { loadAgentCatalog } from "../src/lib/agent-catalog.js";
import { computeAgentReadiness } from "../src/lib/agent-readiness.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("agent roster and catalog alignment", () => {
  beforeAll(() => setTenantId("mal"));

  it("keeps catalog, definitions, capability, routes and chain aligned", () => {
    expect(validateAgentAlignment()).toEqual([]);
  });

  it("rejects disabling required agents", () => {
    const roster = tenantAgentRosterSchema.parse({
      version: 1,
      disabled: ["finance"],
    });
    expect(validateTenantAgentRoster(roster)).toContain(
      "finance: required agent cannot be disabled"
    );
  });

  it("locks Platform Guide to explicit read-only consult", () => {
    const guide = loadAgentCatalog().agents.platform_guide;
    expect(guide.activation).toBe("developer_explicit");
    expect(guide.dispatch_modes).toEqual(["consult"]);
    expect(guide.auto_route).toBe(false);
    expect(guide.auto_pulse).toBe(false);
    expect(guide.access.write).toEqual([]);
    expect(computeAgentReadiness("platform_guide").pct).toBeGreaterThanOrEqual(80);
  });
});
