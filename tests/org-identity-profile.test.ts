import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildIdentityDocument } from "../src/lib/protocol/identity.js";
import { loadOrgIdentityProfile } from "../src/lib/org/identity-profile.js";
import { clearWireGovernanceCacheForTests } from "../src/lib/jurisdiction/wire-governance/index.js";

describe("org identity profile adapter", () => {
  beforeEach(() => {
    setTenantId("demo");
    clearWireGovernanceCacheForTests();
  });

  it("loads tenant display name via org adapter", () => {
    const profile = loadOrgIdentityProfile();
    expect(profile.display_name.length).toBeGreaterThan(0);
    expect(profile.jurisdiction).toBe("JP");
  });

  it("buildIdentityDocument uses adapter not direct company import in protocol", () => {
    const profile = loadOrgIdentityProfile();
    const doc = buildIdentityDocument({ omitCorporateNumber: true });
    expect(doc.display_name).toBe(profile.display_name);
    expect(doc.jurisdiction).toBe(profile.jurisdiction);
  });
});
