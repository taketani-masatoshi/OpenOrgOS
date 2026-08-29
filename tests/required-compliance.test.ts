// @catalog-ids: hospitality,jp_medical_device,jp_certification
import { describe, expect, it } from "vitest";
import {
  loadRequiredComplianceFile,
  listLicenseGateGroups,
  listRegistrationGateGroups,
} from "../src/lib/required-compliance.js";
import { listPermitOpeningBlockers } from "../src/lib/permit-opening-gate.js";

describe("required-compliance declarations", () => {
  it("loads hospitality Required Compliance YAML", () => {
    const file = loadRequiredComplianceFile("hospitality");
    expect(file).not.toBeNull();
    expect(file!.module_id).toBe("hospitality");
    expect(file!.requirements[0]?.compliance_type_ids).toContain("pt-ryokan-shukuhaku");
  });

  it("lists license gate groups for G-01", () => {
    const groups = listLicenseGateGroups("hospitality");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.some((g) => g.requirement_id === "rc-hospitality-ryokan-permit")).toBe(true);
    expect(groups.some((g) => g.requirement_id === "rc-hospitality-fire-compliance")).toBe(true);
  });

  it("lists registration gate groups for lodging tax", () => {
    const groups = listRegistrationGateGroups("hospitality");
    expect(groups.some((g) => g.requirement_id === "rc-hospitality-lodging-tax-registration")).toBe(
      true,
    );
    expect(groups[0]?.permit_type_ids).toContain("pt-lodging-tax-registration");
  });

  it("loads record fulfilment requirement", () => {
    const file = loadRequiredComplianceFile("hospitality");
    expect(file?.requirements.some((r) => r.fulfilment === "record")).toBe(true);
  });

  it("jp_medical_device declares license + specialized", () => {
    const file = loadRequiredComplianceFile("jp_medical_device");
    expect(file?.requirements.some((r) => r.fulfilment === "license")).toBe(true);
    expect(file?.requirements.some((r) => r.fulfilment === "specialized")).toBe(true);
  });

  it("opening gate uses declaration (does not throw)", () => {
    const blockers = listPermitOpeningBlockers();
    expect(Array.isArray(blockers)).toBe(true);
    const hosp = blockers.filter((b) => b.module_id === "hospitality");
    for (const b of hosp) {
      expect(b.requirement_id).toBeTruthy();
    }
    // Declaration defines registration gates; active permits may clear mal blockers.
    expect(listRegistrationGateGroups("hospitality").length).toBeGreaterThan(0);
  });
});
