// @catalog-ids: jp_permit_application,hospitality
import { describe, expect, it } from "vitest";
import {
  listPermitOpeningBlockers,
  MODULE_REQUIRED_PERMIT_ANY_OF,
} from "../src/lib/permit-opening-gate.js";
import { listLicenseGateGroups } from "../src/lib/required-compliance.js";

describe("permit opening gate G-01", () => {
  it("defines hospitality required permit types via YAML or fallback", () => {
    const groups = listLicenseGateGroups("hospitality");
    expect(groups[0]?.permit_type_ids).toContain("pt-ryokan-shukuhaku");
    expect(MODULE_REQUIRED_PERMIT_ANY_OF.jp_minpaku).toContain("pt-minpaku-notification");
  });

  it("lists blockers when permits are not active (tenant-dependent)", () => {
    const blockers = listPermitOpeningBlockers();
    expect(Array.isArray(blockers)).toBe(true);
    for (const b of blockers) {
      expect(b.id).toMatch(/^PERMIT-GATE-/);
      expect(b.required_any_of.length).toBeGreaterThan(0);
    }
  });
});
