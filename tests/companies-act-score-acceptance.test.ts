/**
 * Hand-computed Companies Act score. Expected yen are literals in this file.
 * Do not rebuild them with inferBsClass or the statement pack.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chartOfAccountsSchema } from "../schemas/finance/chart-of-accounts.js";
import { loadChartOfAccounts } from "../src/lib/data.js";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { yearEndDeclarationPath } from "../src/lib/finance/year-end-file.js";
import { runCompaniesActScore } from "../src/lib/finance/ledger/companies-act-score.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { clearTenantId, runWithTenantId } from "../src/lib/tenant.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";

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

const EXPECTED_AMOUNTS = {
  current_assets: 330_000,
  noncurrent_assets: 0,
  total_assets: 330_000,
  current_liabilities: 0,
  noncurrent_liabilities: 0,
  total_liabilities: 0,
  capital: CAPITAL_YEN,
  capital_surplus: 0,
  retained_earnings: 30_000,
  total_net_assets: 330_000,
  total_liabilities_and_net_assets: 330_000,
  unclassified_balance: 0,
  revenue: REVENUE_YEN,
  cogs: 0,
  gross_profit: 100_000,
  sga: SGA_YEN,
  operating_profit: 60_000,
  non_operating_income: 0,
  non_operating_expense: 0,
  ordinary_profit: 60_000,
  extraordinary_gain: 0,
  extraordinary_loss: 0,
  pretax_profit: 60_000,
  income_tax: INCOME_TAX_YEN,
  net_profit: 50_000,
  retained_opening: 0,
  retained_net_income: 50_000,
  retained_dividend: DIVIDEND_YEN,
  retained_closing: 30_000,
  capital_contribution: CAPITAL_YEN,
  legal_reserve_addition: 2_000,
  surplus_carryforward: 28_000,
} as const;

const NOTE_ARTICLE_IDS = [
  "reg-98-2-2",
  "reg-98-2-3",
  "reg-98-2-4",
  "reg-98-2-6",
  "reg-98-2-9",
  "reg-98-2-18-2",
  "reg-98-2-19",
];

const NOTE_HEADINGS = [
  "重要な会計方針",
  "会計方針の変更",
  "表示方法の変更",
  "誤謬の訂正",
  "株主資本等変動",
  "収益認識",
  "その他",
];

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

describe("companies act score acceptance", () => {
  it("scores the hand-computed statements at 100", () => {
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

      writeFileSync(
        yearEndDeclarationPath(FISCAL_YEAR),
        [
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
          "",
        ].join("\n"),
      );

      return runCompaniesActScore(FISCAL_YEAR, {
        amounts: EXPECTED_AMOUNTS,
        texts: {
          valuation_and_translation: "該当なし",
          share_warrants: "該当なし",
        },
        noteArticleIds: NOTE_ARTICLE_IDS,
        noteHeadings: NOTE_HEADINGS,
        policyFragments: [ASSET_VALUATION, DEPRECIATION, PROVISIONS, REVENUE_AND_EXPENSE],
        titles: ["貸借対照表", "損益計算書", "株主資本等変動計算書", "個別注記表", "剰余金の処分"],
      });
    });

    expect(result.score).toBe(100);
    expect(result.checks.every((item) => item.pass)).toBe(true);
  });
});
