// @catalog-ids: hospitality,jp_permit_application
import { describe, expect, it } from "vitest";
import {
  attestExistingPermit,
  formatComplianceIntakePlan,
  licenseEvidenceCategory,
  planComplianceIntake,
} from "../src/lib/module-compliance-onboard.js";

describe("module compliance intake", () => {
  it("maps permit types to evidence categories", () => {
    expect(licenseEvidenceCategory("pt-ryokan-shukuhaku")).toBe("ryokan");
    expect(licenseEvidenceCategory("pt-fiea-type1")).toBe("finance");
    expect(licenseEvidenceCategory("pt-cosmetics-mah")).toBe("medical");
  });

  it("plans intake for hospitality from Required Compliance", () => {
    const plan = planComplianceIntake("hospitality", { propertyId: "PROP-002" });
    expect(plan.has_declaration).toBe(true);
    expect(plan.items.length).toBeGreaterThan(0);
    const item = plan.items[0]!;
    expect(item.permit_type_ids).toContain("pt-ryokan-shukuhaku");
    // MAL typically has pending PER → needs_attest or needs_decision
    expect(["satisfied", "needs_attest", "needs_decision"]).toContain(item.status);
    const md = formatComplianceIntakePlan(plan);
    expect(md).toContain("Compliance intake");
    expect(md).toContain("permit-app intake");
  });

  it("reports no declaration for unknown module without file", () => {
    const plan = planComplianceIntake("travel_booking");
    expect(plan.has_declaration).toBe(false);
    expect(plan.items[0]?.status).toBe("no_license_requirements");
  });

  it("allows catalog-only attest options without moduleId", () => {
    // dry-run validation path — unknown type rejects; known type does not throw pre-write
    expect(() =>
      attestExistingPermit({
        permitTypeId: "pt-not-a-real-type",
        permitNumber: "X",
        issuedOn: "2026-01-01",
        evidencePath: "/tmp/x.pdf",
      })
    ).toThrow(/Unknown permit type/);
  });
});
