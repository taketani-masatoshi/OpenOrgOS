import { describe, expect, it } from "vitest";
import { evaluateAnnualCloseGates } from "../src/lib/finance/annual-close.js";
import {
  buildIndividualNotes,
  equityChangeAmounts,
} from "../src/lib/finance/ledger/balance-sheet.js";
import { buildCorporateTaxXmlDraft } from "../src/lib/finance/jp-corporate-tax-xml.js";
import { useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("final accounts close gates", () => {
  it("splits equity into capital, surplus, and retained earnings", () => {
    useFinanceFixtureTenant();
    const change = equityChangeAmounts({ asOf: "2027-01-31", fiscalYear: "FY2026" });
    expect(change.components.map((row) => row.equity_class)).toEqual([
      "capital",
      "capital_surplus",
      "retained",
    ]);
  });

  it("does not use the hardcoded straight-line note as the only policy", () => {
    useFinanceFixtureTenant();
    const notes = buildIndividualNotes({ asOf: "2027-01-31", fiscalYear: "FY2026" });
    expect(notes.join("\n")).not.toBe(
      [
        "会計方針: 減価償却は定額法により計上する。収益および費用は発生主義で認識する。",
        "配当・資本取引: 該当なし",
      ].join("\n")
    );
    expect(notes.some((line) => line.startsWith("後発事象:"))).toBe(true);
  });

  it("refuses the annual close when the year-end declaration is absent", () => {
    useFinanceFixtureTenant();
    const evaluation = evaluateAnnualCloseGates("FY2026");
    expect(evaluation.can_close).toBe(false);
    expect(evaluation.errors).toContain("year-end declaration missing");
    expect(evaluation.errors).toContain("subsequent events missing");
  });

  it("puts retained earnings rollforward, not total equity, in the draft", () => {
    useFinanceFixtureTenant();
    const draft = buildCorporateTaxXmlDraft({ fiscalYear: "FY2026", asOf: "2027-01-31" });
    expect(draft.submission).toBe("not-for-etax");
    expect(draft.xml).not.toContain("retained_placeholder");
    expect(draft.xml).not.toContain("利益積立金内訳（税理士確定）");
    expect(draft.xml).toContain('form="別表五（一）"');
    expect(draft.xml).toContain('row="25"');
  });
});
