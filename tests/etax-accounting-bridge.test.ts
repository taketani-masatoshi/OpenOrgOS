import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { returnPackageFromTaxAdjustment } from "../src/lib/etax/return-package-from-accounting.js";

const taxpayer = {
  taxpayerId: "TP-BRIDGE",
  zeimushoCd: "01101",
  zeimushoNm: "麹町",
  nozeishaId: "0000000000000001",
  nozeishaNm: "テスト株式会社",
  nozeishaAdr: "東京都千代田区",
};

describe("etax accounting bridge", () => {
  it("builds a deterministic package with corporate-tax draft provenance", () => {
    const input = {
      worksheet: { fiscal_year: "FY2026", as_of: "2026-03-31", taxable_income_yen: 100 },
      taxpayer,
      draftPath: "docs/company/tax/FY2026-corporate-tax-draft.xml",
      teishutsuDay: "2026-03-31",
      createdBy: "test",
      now: "2026-09-21T00:00:00.000Z",
      id: "ETAX-PKG-bridge",
    };
    const first = returnPackageFromTaxAdjustment(input);
    const second = returnPackageFromTaxAdjustment(input);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.sourceReferences.map((row) => row.kind)).toContain("corporate_tax_xml_draft");
    expect(first.procedureCode).toBe("RHO0010");
  });

  it("does not add a submit API under src/lib/finance", () => {
    const root = join("src/lib/finance");
    const files = readdirSync(root).filter((name) => name.endsWith(".ts"));
    for (const name of files) {
      const source = readFileSync(join(root, name), "utf-8");
      expect(source).not.toMatch(/sendSignedSubmission|runMockFilingLifecycle|submitToEtax/);
    }
  });
});
