/**
 * Development-complete gate: ordinance labels + fixture yen empty-diff.
 * Official published yen is out of scope for this score.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { chartOfAccountsSchema } from "../schemas/finance/chart-of-accounts.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { appendJournalEntry, loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { yearEndDeclarationPath } from "../src/lib/finance/year-end-file.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
} from "../src/lib/finance/fiscal-year.js";
import {
  companiesActDisplayScore,
  COMPANIES_ACT_ORDINANCE_LABEL_PIN,
  runCompaniesActScore,
  withCompaniesActDevAmounts,
  type CompaniesActPinLine,
} from "../src/lib/finance/ledger/companies-act-score.js";
import { legalReserveAdditionYen, buildStatutoryStatements } from "../src/lib/finance/ledger/statutory-statements.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { clearTenantId, runWithTenantId } from "../src/lib/tenant.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";

const pinFileSchema = z.object({
  amounts: z.array(z.number().int().nullable()),
});

function loadPin(): CompaniesActPinLine[] {
  const path = fileURLToPath(new URL("./fixtures/companies-act/display-lines.yaml", import.meta.url));
  const amounts = pinFileSchema.parse(parseYaml(readFileSync(path, "utf8"))).amounts;
  return withCompaniesActDevAmounts(amounts);
}

const FISCAL_YEAR = "FY2026";
const OCCURRED_AT = "2027-01-15T00:00:00.000Z";
const PERIOD = "2027-01";

const CAPITAL_YEN = 300_000;
const REVENUE_YEN = 100_000;
const SGA_YEN = 40_000;
const INCOME_TAX_YEN = 10_000;
const DIVIDEND_YEN = 20_000;

const ASSET_VALUATION = "資産の評価基準は取得原価である。";
const DEPRECIATION = "固定資産はない。";
const PROVISIONS = "引当金の計上基準は該当なし。";
const REVENUE_AND_EXPENSE = "収益は役務の提供が完了した時に認識し、費用は発生した時に認識する。";
const REVENUE_RECOGNITION = "収益は役務の提供が完了した時に認識する。";

let workspace: string | null = null;
const originalWorkspace = process.env.ORGOS_WORKSPACE;
const originalSkipBackup = process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  if (originalWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
  else process.env.ORGOS_WORKSPACE = originalWorkspace;
  if (originalSkipBackup === undefined) delete process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  else process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = originalSkipBackup;
  clearTenantId();
  refreshOrgOsPaths();
  if (workspace) rmSync(workspace, { recursive: true, force: true });
  workspace = null;
});

function post(input: {
  entryId: string;
  description: string;
  source: { kind: "manual"; authorized_by: string } | { kind: "capital" | "dividend"; period: string };
  debit: string;
  credit: string;
  amount: number;
}): void {
  appendJournalEntry({
    entry_id: input.entryId,
    occurred_at: OCCURRED_AT,
    description: input.description,
    source: input.source,
    evidence_refs: ["test:companies-act-score"],
    lines: [
      { account_code: input.debit, debit_yen: input.amount, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: input.credit, debit_yen: 0, credit_yen: input.amount, tax_category: "out_of_scope" },
    ],
  });
}

function declarationYaml(goingConcern: boolean): string {
  return [
    `fiscal_year: ${FISCAL_YEAR}`,
    "inventory: none",
    "accruals: []",
    "subsequent_events:",
    "  status: none",
    "consumption_tax: exempt",
    "surplus_disposal:",
    "  status: dividend",
    "statutory_notes:",
    `  asset_valuation: ${JSON.stringify(ASSET_VALUATION)}`,
    `  depreciation: ${JSON.stringify(DEPRECIATION)}`,
    `  provisions: ${JSON.stringify(PROVISIONS)}`,
    `  revenue_and_expense: ${JSON.stringify(REVENUE_AND_EXPENSE)}`,
    "  policy_change:",
    "    status: none",
    "  presentation_change:",
    "    status: none",
    "  error_correction:",
    "    status: none",
    `  revenue_recognition: ${JSON.stringify(REVENUE_RECOGNITION)}`,
    "  other:",
    "    status: none",
    goingConcern ? "  going_concern:\n    status: none" : "",
    "  tax_effect:",
    "    status: none",
    "  related_party:",
    "    status: none",
    "  per_share:",
    "    status: none",
    "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

describe("companies act score acceptance", () => {
  it("loads fixture yen onto the product ordinance pin in order", () => {
    const pin = loadPin();
    expect(pin.map((line) => line.label)).toEqual(
      COMPANIES_ACT_ORDINANCE_LABEL_PIN.map((line) => line.label),
    );
    expect(pin.find((line) => line.label === "売上総利益金額")?.example_yen).toBe(100_000);
    expect(pin.find((line) => line.label === "継続企業の前提に関する注記")?.example_yen).toBeUndefined();
  });

  it("keeps the ordinance labels and scores 12 on the development fixture pin", () => {
    workspace = mkdtempSync(join(tmpdir(), "orgos-companies-act-score-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();
    const provisioned = provisionLedgerTenant({
      tenantId: "companies-act-score",
      companyName: "Companies Act Score KK",
      adminEmail: "ceo@companies-act-score.example",
      plan: "business",
    });

    const result = runWithTenantId(provisioned.tenant_id, () => {
      ensureLedgerDemoChartOfAccounts();
      const coa = loadChartOfAccounts();
      const upsert = (account: Record<string, unknown> & { code: string }) => {
        const index = coa.accounts.findIndex((row) => row.code === account.code);
        if (index >= 0) coa.accounts[index] = { ...coa.accounts[index], ...account };
        else coa.accounts.push(account as (typeof coa.accounts)[number]);
      };
      upsert({ code: "1100", name: "現金及び預金", type: "asset", normal_balance: "debit", bs_class: "current", cf_role: "cash" });
      upsert({ code: "3100", name: "資本金", type: "equity", normal_balance: "credit", equity_class: "capital", cf_role: "equity" });
      upsert({ code: "3200", name: "繰越利益剰余金", type: "equity", normal_balance: "credit", equity_class: "retained", cf_role: "equity" });
      upsert({ code: "4100", name: "売上高", type: "revenue", normal_balance: "credit", statement_section: "revenue" });
      upsert({ code: "5100", name: "販売費及び一般管理費", type: "expense", normal_balance: "debit", statement_section: "sga" });
      upsert({ code: "8500", name: "法人税等", type: "expense", normal_balance: "debit", statement_section: "income_tax" });
      writeYamlFile(
        join(getDataDir(), "finance", "chart-of-accounts.yaml"),
        chartOfAccountsSchema.parse(coa),
      );

      post({
        entryId: "JE-SCORE-CAPITAL",
        description: "capital contribution",
        source: { kind: "capital", period: PERIOD },
        debit: "1100",
        credit: "3100",
        amount: CAPITAL_YEN,
      });
      post({
        entryId: "JE-SCORE-REVENUE",
        description: "sales",
        source: { kind: "manual", authorized_by: provisioned.ceo_operator_id },
        debit: "1100",
        credit: "4100",
        amount: REVENUE_YEN,
      });
      post({
        entryId: "JE-SCORE-SGA",
        description: "selling and administrative",
        source: { kind: "manual", authorized_by: provisioned.ceo_operator_id },
        debit: "5100",
        credit: "1100",
        amount: SGA_YEN,
      });
      post({
        entryId: "JE-SCORE-TAX",
        description: "income taxes",
        source: { kind: "manual", authorized_by: provisioned.ceo_operator_id },
        debit: "8500",
        credit: "1100",
        amount: INCOME_TAX_YEN,
      });
      post({
        entryId: "JE-SCORE-DIVIDEND",
        description: "dividend",
        source: { kind: "dividend", period: PERIOD },
        debit: "3200",
        credit: "1100",
        amount: DIVIDEND_YEN,
      });

      writeFileSync(yearEndDeclarationPath(FISCAL_YEAR), declarationYaml(true));

      const pin = loadPin();
      const statement = buildStatutoryStatements(FISCAL_YEAR);
      const asOf = fiscalYearEndDate(FISCAL_YEAR, resolveCompanyFiscalYearEndMonth());
      const trial = buildTrialBalance({ asOf });
      const sectionTotal = (section: string) =>
        trial.rows.reduce((sum, row) => {
          const account = coa.accounts.find((item) => item.code === row.account_code);
          if (account?.statement_section !== section) return sum;
          return sum + Math.abs(row.balance_yen);
        }, 0);
      const currentAssets = trial.rows.reduce((sum, row) => {
        const account = coa.accounts.find((item) => item.code === row.account_code);
        if (!account || account.bs_class !== "current") return sum;
        if (account.type !== "asset" && account.type !== "asset_contra") return sum;
        const signed = account.type === "asset_contra" ? -Math.abs(row.balance_yen) : row.balance_yen;
        return sum + signed;
      }, 0);
      const pinLabels = pin.map((line) => line.label);
      const emitted = [
        ...statement.bsRows.map((row) => row.label),
        ...statement.plRows.map((row) => row.label),
        ...statement.equityRows.map((row) => row.label),
        ...statement.notes.map((note) => note.heading),
      ];
      const reserveCodes = new Set(
        coa.accounts.filter((account) => account.statutory_role === "legal_reserve").map((account) => account.code),
      );
      const postedReserve = loadJournalEntries().entries.some((entry) =>
        entry.lines.some(
          (line) => reserveCodes.has(line.account_code) && (line.debit_yen !== 0 || line.credit_yen !== 0),
        ),
      );
      return {
        score: runCompaniesActScore(FISCAL_YEAR, pin),
        displayLabels: statement.displayLabels,
        pinLabels,
        emitted,
        notes: statement.notes,
        revenue: statement.amounts.revenue,
        trialRevenue: sectionTotal("revenue"),
        sga: statement.amounts.sga,
        trialSga: sectionTotal("sga"),
        incomeTax: statement.amounts.income_tax,
        trialIncomeTax: sectionTotal("income_tax"),
        currentAssets: statement.amounts.current_assets,
        trialCurrentAssets: currentAssets,
        reserve: statement.amounts.legal_reserve_addition,
        postedReserve,
        complete: statement.complete,
      };
    });

    expect(result.displayLabels.filter((label) => !result.pinLabels.includes(label))).toEqual([]);
    expect(result.pinLabels.filter((label) => !result.displayLabels.includes(label))).toEqual([]);
    expect(result.displayLabels).toEqual(result.pinLabels);
    for (const label of result.emitted) expect(result.pinLabels).toContain(label);
    expect(result.revenue).toBe(result.trialRevenue);
    expect(result.sga).toBe(result.trialSga);
    expect(result.incomeTax).toBe(result.trialIncomeTax);
    expect(result.currentAssets).toBe(result.trialCurrentAssets);
    expect(result.reserve).toBe(Math.min(Math.floor(DIVIDEND_YEN / 10), Math.floor(CAPITAL_YEN / 4)));
    expect(result.postedReserve).toBe(false);
    expect(
      legalReserveAdditionYen({
        capitalYen: CAPITAL_YEN,
        existingReserveYen: 0,
        dividendYen: 1_000_000,
      }).additionYen,
    ).toBe(Math.floor(CAPITAL_YEN / 4));
    expect(result.complete).toBe(true);
    const noneBodies = result.notes.filter((note) => note.heading !== "重要な会計方針に係る事項に関する注記");
    expect(noneBodies.every((note) => note.body === "該当なし")).toBe(true);
    expect(result.score.score).toBe(12);
    expect(result.score.checks.every((item) => item.pass)).toBe(true);
  });

  it("wrong fixture yen scores 0 (empty-diff required when yen is present)", () => {
    const pin = loadPin().map((line) =>
      Number.isInteger(line.example_yen) ? { ...line, example_yen: 1 } : line,
    );
    const labels = pin.map((line) => line.label);
    const amounts = pin.map((line) => (Number.isInteger(line.example_yen) ? 1 : null));
    // Intentionally mismatched amounts vs pin yen (all pin yen=1, amounts say null for notes only).
    expect(companiesActDisplayScore(labels, pin, amounts.map(() => 0))).toBe(0);
    // Labels alone without amounts while pin carries yen → 0.
    expect(companiesActDisplayScore(labels, loadPin())).toBe(0);
  });

  it("scores 0 when extraordinary profit and loss are one line", () => {
    const pin = loadPin();
    const collapsed = pin.map((line) =>
      line.label === "特別利益" || line.label === "特別損失" ? "特別損益" : line.label,
    );
    const amounts = pin.map((line) => line.example_yen ?? null);
    expect(companiesActDisplayScore(collapsed, pin, amounts)).toBe(0);
    expect(companiesActDisplayScore(pin.map((line) => line.label), pin, amounts)).toBe(12);
    expect(
      companiesActDisplayScore(
        pin.map((line) => line.label),
        pin.map((line) => ({ ...line, article: " " })),
        amounts,
      ),
    ).toBe(0);
  });

  it("scores 0 when a dividend has no capital account", () => {
    workspace = mkdtempSync(join(tmpdir(), "orgos-companies-act-score-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();
    const provisioned = provisionLedgerTenant({
      tenantId: "companies-act-score-no-capital",
      companyName: "Companies Act Score KK",
      adminEmail: "ceo@companies-act-score.example",
      plan: "business",
    });
    const result = runWithTenantId(provisioned.tenant_id, () => {
      ensureLedgerDemoChartOfAccounts();
      const coa = loadChartOfAccounts();
      const retained = coa.accounts.find((account) => account.code === "3200");
      if (retained) retained.equity_class = "retained";
      for (const account of coa.accounts) {
        if (account.equity_class === "capital") delete account.equity_class;
      }
      writeYamlFile(join(getDataDir(), "finance", "chart-of-accounts.yaml"), chartOfAccountsSchema.parse(coa));
      post({
        entryId: "JE-SCORE-DIVIDEND",
        description: "dividend",
        source: { kind: "dividend", period: PERIOD },
        debit: "3200",
        credit: "1100",
        amount: DIVIDEND_YEN,
      });
      writeFileSync(yearEndDeclarationPath(FISCAL_YEAR), declarationYaml(true));
      const statement = buildStatutoryStatements(FISCAL_YEAR);
      return {
        score: runCompaniesActScore(FISCAL_YEAR, loadPin()),
        complete: statement.complete,
        errors: statement.errors,
        reserve: statement.amounts.legal_reserve_addition,
      };
    });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("dividend without a capital account");
    expect(result.reserve).toBe(0);
    expect(result.score.score).toBe(0);
  });

  it("scores 0 when a note fact is missing and does not say 該当なし", () => {
    workspace = mkdtempSync(join(tmpdir(), "orgos-companies-act-score-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    console.log = () => undefined;
    refreshOrgOsPaths();
    const provisioned = provisionLedgerTenant({
      tenantId: "companies-act-score-missing-note",
      companyName: "Companies Act Score KK",
      adminEmail: "ceo@companies-act-score.example",
      plan: "business",
    });
    const result = runWithTenantId(provisioned.tenant_id, () => {
      ensureLedgerDemoChartOfAccounts();
      writeFileSync(yearEndDeclarationPath(FISCAL_YEAR), declarationYaml(false));
      const statement = buildStatutoryStatements(FISCAL_YEAR);
      const goingConcern = statement.notes.find((note) => note.heading === "継続企業の前提に関する注記");
      return {
        score: runCompaniesActScore(FISCAL_YEAR, loadPin()),
        heading: goingConcern?.heading ?? "",
        body: goingConcern?.body ?? "該当なし",
      };
    });
    expect(result.heading.length).toBeGreaterThan(0);
    expect(result.body).toBe("");
    expect(result.body).not.toBe("該当なし");
    expect(result.score.score).toBe(0);
    expect(result.score.checks[0]?.detail).toContain("note");
  });
});
