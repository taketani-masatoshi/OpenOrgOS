import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { evaluateAnnualCloseGates } from "../src/lib/finance/annual-close.js";
import { evaluateKessanFromGl } from "../src/lib/finance/kessan-gl.js";
import { resolveJournalSourceAccounts } from "../src/lib/finance/journal-source-accounts.js";
import { yearEndDeclarationPath } from "../src/lib/finance/year-end-file.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import {
  buildIndividualNotes,
  inferBsClass,
} from "../src/lib/finance/ledger/balance-sheet.js";
import {
  COMPANIES_ACT_LINE_MAP,
  buildCompaniesActStatementPack,
} from "../src/lib/finance/ledger/companies-act-statement-map.js";
import {
  buildAccountingPolicyParagraph,
  buildSurplusDisposalParagraph,
} from "../src/lib/finance/ledger/financial-statement-disclosures.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import {
  applyFixtureStatementRoles,
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const FISCAL_YEAR = "FY2026";
const RETAINED_BOILERPLATE = "内部留保として積み立てる";

function writeYearEnd(surplus?: "none" | "dividend"): void {
  const surplusYaml = surplus ? `surplus_disposal:\n  status: ${surplus}\n` : "";
  writeFileSync(
    yearEndDeclarationPath(FISCAL_YEAR),
    [
      `fiscal_year: ${FISCAL_YEAR}`,
      "inventory: none",
      "accruals: []",
      "subsequent_events:",
      "  status: none",
      "consumption_tax: exempt",
      surplusYaml,
    ].join("\n"),
  );
}

function removeYearEnd(): void {
  const path = yearEndDeclarationPath(FISCAL_YEAR);
  if (existsSync(path)) unlinkSync(path);
}

afterEach(() => {
  removeYearEnd();
});

describe("companies act statements", () => {
  it("fills every mapped line and matches the trial balance", () => {
    useFinanceFixtureTenant();
    applyFixtureStatementRoles();
    writeYearEnd("none");
    const pack = buildCompaniesActStatementPack(FISCAL_YEAR);
    expect(pack.rows.map((row) => row.id)).toEqual(COMPANIES_ACT_LINE_MAP.map((line) => line.id));
    expect(pack.bs_rows.map((row) => row.label)).toEqual(
      expect.arrayContaining(["流動資産", "固定資産", "流動負債", "固定負債", "資本金", "資本剰余金", "利益剰余金"]),
    );
    expect(pack.pl_rows.map((row) => row.label)).toEqual(
      expect.arrayContaining(["特別利益", "特別損失"]),
    );

    const coa = loadChartOfAccounts();
    const trial = buildTrialBalance({ asOf: pack.as_of, coa });
    const retained = coa.journal_source_accounts?.retained_earnings;

    const expected = new Map<string, number>();
    const add = (id: string, amount: number) => expected.set(id, (expected.get(id) ?? 0) + amount);
    for (const row of trial.rows) {
      const account = coa.accounts.find((item) => item.code === row.account_code);
      if (!account) continue;
      const bs = inferBsClass(account);
      if ((account.type === "asset" || account.type === "asset_contra") && bs === "current") {
        add("current_assets", account.type === "asset_contra" ? -Math.abs(row.balance_yen) : row.balance_yen);
      }
      if ((account.type === "asset" || account.type === "asset_contra") && bs === "noncurrent") {
        add("noncurrent_assets", account.type === "asset_contra" ? -Math.abs(row.balance_yen) : row.balance_yen);
      }
      if (account.type === "liability" && bs === "current") add("current_liabilities", row.balance_yen);
      if (account.type === "liability" && bs === "noncurrent") add("noncurrent_liabilities", row.balance_yen);
      if (account.type === "equity") {
        const cls = account.equity_class ?? (account.code === retained ? "retained" : undefined);
        if (cls === "capital") add("capital", row.balance_yen);
        if (cls === "capital_surplus") add("capital_surplus", row.balance_yen);
        if (cls === "retained") add("retained", row.balance_yen);
      }
      if (account.type === "revenue" || account.type === "expense") {
        const section = account.statement_section
          ?? (account.type === "revenue" ? "revenue" : "sga");
        add(section, Math.abs(row.balance_yen));
      }
    }
    expected.set("surplus_dividend", 0);

    for (const row of pack.rows) {
      if (row.amount_yen === null) continue;
      expect(row.amount_yen, row.id).toBe(expected.get(row.id) ?? 0);
    }
  });

  it("uses the disclosure text for notes and refuses the retained-earnings boilerplate", () => {
    useFinanceFixtureTenant();
    applyFixtureStatementRoles();
    writeYearEnd("none");
    const pack = buildCompaniesActStatementPack(FISCAL_YEAR);
    const notes = buildIndividualNotes({ asOf: pack.as_of, fiscalYear: FISCAL_YEAR });
    const policy = buildAccountingPolicyParagraph({ asOf: pack.as_of, fiscalYear: FISCAL_YEAR });
    expect(pack.note_lines).toEqual(notes);
    expect(pack.note_lines[0]).toBe(policy);
    expect(pack.surplus_text).toBe(buildSurplusDisposalParagraph(FISCAL_YEAR).text);
    expect(pack.surplus_text).not.toContain(RETAINED_BOILERPLATE);
    expect(pack.note_lines.join("\n")).not.toContain("定額法により計上しています");
  });

  it("reports a dividend only from the posted journal", () => {
    useFinanceFixtureTenant();
    applyFixtureStatementRoles();
    resetFixtureJournalEntries();
    writeYearEnd("dividend");
    const retained = resolveJournalSourceAccounts().retained_earnings;
    const packBefore = buildCompaniesActStatementPack(FISCAL_YEAR);
    expect(packBefore.complete).toBe(false);
    expect(packBefore.surplus_text).not.toContain(RETAINED_BOILERPLATE);

    appendJournalEntry({
      entry_id: "JE-DIV-LANE-B",
      occurred_at: `${packBefore.as_of}T12:00:00.000Z`,
      description: "surplus dividend",
      source: { kind: "dividend", period: packBefore.as_of.slice(0, 7) },
      evidence_refs: ["test:lane-b-dividend"],
      lines: [
        { account_code: retained, debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 1000, tax_category: "out_of_scope" },
      ],
    });
    const surplus = buildSurplusDisposalParagraph(FISCAL_YEAR);
    expect(surplus.errors).toEqual([]);
    expect(surplus.text).toBe("剰余金の処分: 配当 1000 円（仕訳に基づく）");
    expect(surplus.text).not.toContain(RETAINED_BOILERPLATE);
  });

  it("builds the pack without a yojitsu file and does not import tax xml", () => {
    useFinanceFixtureTenant();
    applyFixtureStatementRoles();
    writeYearEnd("none");
    const built = evaluateKessanFromGl(FISCAL_YEAR);
    expect(built.ok).toBe(true);
    expect(built.errors).toEqual([]);

    const sources = [
      "src/lib/finance/ledger/financial-statement-disclosures.ts",
      "src/lib/finance/ledger/companies-act-statement-map.ts",
      "src/lib/finance/kessan-gl.ts",
      "src/lib/kessan-pdf.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/jp-corporate-tax-xml|from ["'].*eltax|tax-adjustment/);
  });

  it("does not make a missing surplus disposal block the annual close", () => {
    useFinanceFixtureTenant();
    writeYearEnd();
    const evaluation = evaluateAnnualCloseGates(FISCAL_YEAR);
    expect(evaluation.errors.some((issue) => issue.includes("surplus"))).toBe(false);
  });
});
