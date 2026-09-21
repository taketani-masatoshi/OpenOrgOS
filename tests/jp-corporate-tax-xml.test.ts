import { describe, expect, it } from "vitest";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import {
  EtaxSendNotApprovedError,
  authorizeEtaxExternalSend,
  taxModuleBoundaryNote,
} from "../src/lib/tax/etax-filing-boundary.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("jp corporate tax xml draft", () => {
  it("builds an internal-books draft that is not a live filing", () => {
    useFinanceFixtureTenant();
    const draft = buildCorporateTaxXmlDraft({
      fiscalYear: "FY2026",
      asOf: "2026-08-31",
    });
    expect(draft.submission).toBe("not-for-etax");
    expect(draft.xml).toContain('submission="not-for-etax"');
    expect(draft.xml).toContain("OrgOSCorporateTaxDraft");
    expect(draft.xml).toContain("<NetIncomeYen>");
    expect(draft.xml).toContain("<BalanceSheet");
    expect(draft.xml).toContain('id="betsu-4-like"');
    expect(draft.xml).toContain('id="betsu-5-1-like"');
    expect(draft.xml).toContain("<Completeness>");
    expect(draft.xml).not.toContain(">TBD<");
    expect(draft.relative_path).toContain("corporate-tax-draft.xml");
  });

  it("refuses external send until a human approves, using fixture books only", () => {
    useFinanceFixtureTenant();
    expect(() => authorizeEtaxExternalSend({ humanApproved: false })).toThrow(
      EtaxSendNotApprovedError,
    );
    expect(authorizeEtaxExternalSend({ humanApproved: true })).toEqual({
      submission: "approved-to-submit",
    });
    expect(taxModuleBoundaryNote()).toMatch(/user approval/i);
  });
});
