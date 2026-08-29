import { describe, expect, it } from "vitest";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("jp corporate tax xml draft", () => {
  it("builds advisor-handoff XML that is not for e-Tax submit", () => {
    useFinanceFixtureTenant();
    const draft = buildCorporateTaxXmlDraft({
      fiscalYear: "FY2026",
      asOf: "2026-08-31",
    });
    expect(draft.submission).toBe("not-for-etax");
    expect(draft.xml).toContain('submission="not-for-etax"');
    expect(draft.xml).toContain("OrgOSCorporateTaxDraft");
    expect(draft.xml).toContain("<NetIncomeYen>");
    expect(draft.xml).toContain('id="betsu-4-like"');
    expect(draft.xml).toContain('id="betsu-5-1-like"');
    expect(draft.xml).toContain("<Completeness>");
    expect(draft.xml).not.toContain(">TBD<");
    expect(draft.relative_path).toContain("corporate-tax-draft.xml");
  });
});
