/**
 * JP sole proprietor blue return (一般用) — books pack, kessan, Form B draft, 55/65 gate.
 * e-Tax submit is out of scope (ADR 0052). NTA No.2072.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { loadChartOfAccounts, loadFixedAssets } from "../data.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { buildGeneralLedger } from "./ledger/general-ledger.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { buildBalanceSheet, OWNER_DRAW_ACCOUNT_CODE } from "./ledger/balance-sheet.js";
import { periodPlMovementByAccount } from "./gl-report-basis.js";
import {
  journalEntrySchema,
  normalizeJournalEntry,
  type JournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import type { ChartOfAccounts } from "../../../schemas/finance/types.js";
import { getDataDir, getDocsDir, readYamlFile, writeTrackedFile } from "../utils.js";
import { loadTenantConfig } from "../tenant.js";
import { buildConsumptionTaxDraftReturn } from "./consumption-tax.js";
import { assessEntityModuleMismatches } from "./entity-module-guards.js";
import { collectSetupGateWarnings, loadBlueReturnSetup } from "./sole-proprietor-clarify.js";
import { resolveSolePropCalendarYear } from "./sole-prop-year.js";
import {
  blueReturnIncomeDeductionsSchema,
  EARTHQUAKE_INSURANCE_DEDUCTION_CAP_YEN,
  LIFE_INSURANCE_DEDUCTION_CAP_YEN,
  type BlueReturnIncomeDeductions,
} from "../../../schemas/finance/blue-return-income-deductions.js";

export const BLUE_RETURN_DEDUCTION_55 = 550_000;
export const BLUE_RETURN_DEDUCTION_65 = 650_000;
export const BLUE_RETURN_DEDUCTION_10 = 100_000;
/** 令和7年分以後 · 合計所得 2,350万円以下の基礎控除（標準） */
export const BASIC_DEDUCTION_YEN = 580_000;
export const RECONSTRUCTION_SURTAX_RATE = 0.021;

/** 青色申告決算書（一般用）経費の法定行順 */
export const STATUTORY_EXPENSE_LINES = [
  "租税公課",
  "荷造運賃",
  "水道光熱費",
  "旅費交通費",
  "通信費",
  "広告宣伝費",
  "接待交際費",
  "損害保険料",
  "修繕費",
  "消耗品費",
  "減価償却費",
  "福利厚生費",
  "給料賃金",
  "外注工賃",
  "利子割引料",
  "地代家賃",
  "貸倒金",
  "雑費",
] as const;

const DEFAULT_EXPENSE_MAP: Record<string, string> = {
  "5100": "雑費",
};

/** 現金・預金は 1100（合算）または 1110/1120（分割）いずれでも BS に載せる。事業主貸は BS 資産側。 */
const MAJOR_ASSET_CODES = ["1100", "1110", "1120", "1150", "1210", "2170", "3210"] as const;
const MAJOR_LIABILITY_CODES = ["2110", "2120", "2160", "2180"] as const;
/** 事業主貸(3210)は資産の部（buildBalanceSheet と一本化）。資本の部には載せない。 */
const MAJOR_EQUITY_CODES = ["3100", "3220"] as const;

const blueReturnFilingSchema = z.object({
  version: z.union([z.number(), z.string()]).optional(),
  calendar_year: z.number().int().optional(),
  etax_submitted_at: z.string().optional(),
  denshi_yuryo_notified_at: z.string().optional(),
  notes: z.string().optional(),
});

export type BlueReturnFiling = z.output<typeof blueReturnFilingSchema>;

const expenseLineMapSchema = z.object({
  version: z.union([z.number(), z.string()]).optional(),
  lines: z.record(z.string()).default({}),
  default_expense_line: z.string().default("雑費"),
});

const allocationRuleSchema = z.object({
  business_pct: z.number().min(0).max(100),
  method: z.string().optional(),
  notes: z.string().optional(),
});

const blueReturnAllocationSchema = z.object({
  version: z.union([z.number(), z.string()]).optional(),
  calendar_year: z.number().int().optional(),
  default_business_pct: z.number().min(0).max(100).default(100),
  by_account: z.record(allocationRuleSchema).default({}),
  by_entry: z.record(allocationRuleSchema).default({}),
  notes: z.string().optional(),
});

export type BlueReturnAllocation = z.output<typeof blueReturnAllocationSchema>;

export type AllocationApplicationRow = {
  entry_id: string;
  account_code: string;
  gross_yen: number;
  business_pct: number;
  business_yen: number;
  household_yen: number;
  method?: string;
  notes?: string;
};

export type BlueReturnYearContext = {
  calendar_year: number;
  period_from: string;
  period_to: string;
  year_label: string;
  as_of: string;
  prior_as_of: string;
  fiscal_year_label: string;
};

export function resolveBlueReturnYear(
  calendarYear?: number,
  clock?: Date,
): BlueReturnYearContext {
  const year = resolveSolePropCalendarYear({ explicit: calendarYear, clock });
  return {
    calendar_year: year,
    period_from: `${year}-01-01`,
    period_to: `${year}-12-31`,
    year_label: `令和${year - 2018}年分`,
    as_of: `${year}-12-31`,
    prior_as_of: `${year - 1}-12-31`,
    fiscal_year_label: `CY${year}`,
  };
}

export function blueReturnOutputDir(year: number): string {
  const dir = join(getDocsDir(), "finance", "blue-return", String(year));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeBlueDoc(year: number, filename: string, content: string): string {
  return writeTrackedFile(join(blueReturnOutputDir(year), filename), content);
}

export function loadBlueReturnFiling(calendarYear?: number): {
  filing: BlueReturnFiling;
  year_mismatch: boolean;
} {
  const path = join(getDataDir(), "finance", "blue-return-filing.yaml");
  if (!existsSync(path)) {
    return {
      filing: blueReturnFilingSchema.parse({ version: 1, calendar_year: calendarYear }),
      year_mismatch: false,
    };
  }
  const raw = readYamlFile(path, blueReturnFilingSchema);
  const mismatch =
    calendarYear != null &&
    raw.calendar_year != null &&
    raw.calendar_year !== calendarYear;
  return { filing: raw, year_mismatch: mismatch };
}

function loadExpenseLineMap(): z.output<typeof expenseLineMapSchema> {
  const path = join(getDataDir(), "finance", "blue-return-expense-map.yaml");
  if (!existsSync(path)) {
    return expenseLineMapSchema.parse({
      lines: DEFAULT_EXPENSE_MAP,
      default_expense_line: "雑費",
    });
  }
  return readYamlFile(path, expenseLineMapSchema);
}

/** Expense CoA codes that fall through to default 雑費 (mapping gap). */
export function unmappedBlueReturnExpenseCodes(): string[] {
  const map = loadExpenseLineMap();
  const coa = loadChartOfAccounts();
  return coa.accounts
    .filter(
      (a) =>
        a.type === "expense" &&
        a.statement_section !== "cogs" &&
        a.code !== "5000",
    )
    .filter((a) => map.lines[a.code] == null)
    .map((a) => a.code)
    .sort();
}

export function loadBlueReturnAllocation(calendarYear?: number): {
  allocation: BlueReturnAllocation;
  year_mismatch: boolean;
  notes: string[];
} {
  const path = join(getDataDir(), "finance", "blue-return-allocation.yaml");
  const notes: string[] = [];
  if (!existsSync(path)) {
    return {
      allocation: blueReturnAllocationSchema.parse({
        version: 1,
        default_business_pct: 100,
      }),
      year_mismatch: false,
      notes,
    };
  }
  const allocation = readYamlFile(path, blueReturnAllocationSchema);
  const year_mismatch =
    calendarYear != null &&
    allocation.calendar_year != null &&
    allocation.calendar_year !== calendarYear;
  if (year_mismatch) {
    notes.push(
      `warning: blue-return-allocation.yaml の calendar_year=${allocation.calendar_year} が要求年 ${calendarYear} と不一致`,
    );
  }
  notes.push(
    "家事按分: 仕訳が総額のとき business_pct で事業分のみを決算・経費帳に載せる。既に事業分のみ仕訳している場合は 100% のままにすること（二重控除防止）。家事分の自動・事業主貸振替は行わない。",
  );
  return { allocation, year_mismatch, notes };
}

export function resolveBusinessPct(
  allocation: BlueReturnAllocation,
  accountCode: string,
  entryId?: string,
): { business_pct: number; method?: string; notes?: string } {
  if (entryId && allocation.by_entry[entryId]) {
    const rule = allocation.by_entry[entryId]!;
    return {
      business_pct: rule.business_pct,
      method: rule.method,
      notes: rule.notes,
    };
  }
  const byAcct = allocation.by_account[accountCode];
  if (byAcct) {
    return {
      business_pct: byAcct.business_pct,
      method: byAcct.method,
      notes: byAcct.notes,
    };
  }
  return { business_pct: allocation.default_business_pct };
}

export function allocateYen(grossYen: number, businessPct: number): {
  business_yen: number;
  household_yen: number;
} {
  const gross = Math.max(0, Math.floor(grossYen));
  const pct = Math.min(100, Math.max(0, businessPct));
  const business_yen = Math.floor((gross * pct) / 100);
  return { business_yen, household_yen: gross - business_yen };
}

/** 課税所得の千円未満切捨て（国税庁） */
export function truncateTaxableIncomeYen(yenAmount: number): number {
  return Math.floor(Math.max(0, yenAmount) / 1000) * 1000;
}

export function filterJournalsInPeriod(
  entries: JournalEntry[],
  periodFrom: string,
  periodTo: string,
): JournalEntry[] {
  return entries.filter((e) => {
    const date = e.occurred_at.slice(0, 10);
    return date >= periodFrom && date <= periodTo;
  });
}

function inventoryBalance(asOf: string, code: string): number {
  const trial = buildTrialBalance({ asOf });
  const row = trial.rows.find((r) => r.account_code === code);
  return row ? Math.abs(row.balance_yen) : 0;
}

/** Calendar-year P/L from monthly journal movements (not cumulative TB). */
export function buildCalendarYearPl(input: {
  calendarYear: number;
  coa?: ChartOfAccounts;
}): {
  revenue_total: number;
  purchases: number;
  expense_by_code: Map<string, number>;
  rows: Array<{ account_code: string; amount: number; type: string }>;
} {
  const coa = input.coa ?? loadChartOfAccounts();
  const totals = new Map<string, number>();
  for (let month = 1; month <= 12; month++) {
    const key = `${input.calendarYear}-${String(month).padStart(2, "0")}`;
    const movement = periodPlMovementByAccount(key, coa);
    for (const [code, amount] of movement) {
      totals.set(code, (totals.get(code) ?? 0) + amount);
    }
  }
  let revenue_total = 0;
  let purchases = 0;
  const expense_by_code = new Map<string, number>();
  const rows: Array<{ account_code: string; amount: number; type: string }> = [];
  for (const [code, signed] of totals) {
    const account = coa.accounts.find((a) => a.code === code);
    if (!account) continue;
    const amount = Math.abs(signed);
    if (amount === 0) continue;
    rows.push({ account_code: code, amount, type: account.type });
    if (account.type === "revenue") revenue_total += amount;
    if (account.type === "expense") {
      if (account.statement_section === "cogs" || account.code === "5000") {
        purchases += amount;
      } else {
        expense_by_code.set(code, (expense_by_code.get(code) ?? 0) + amount);
      }
    }
  }
  return { revenue_total, purchases, expense_by_code, rows };
}

/** Period journals → purchases/expenses with household/business allocation. */
export function buildAllocatedPeriodCosts(input: {
  calendarYear: number;
  coa?: ChartOfAccounts;
  allocation?: BlueReturnAllocation;
}): {
  purchases_gross: number;
  purchases: number;
  expense_by_code_gross: Map<string, number>;
  expense_by_code: Map<string, number>;
  applications: AllocationApplicationRow[];
  household_total_yen: number;
} {
  const ctx = resolveBlueReturnYear(input.calendarYear);
  const coa = input.coa ?? loadChartOfAccounts();
  const allocation =
    input.allocation ?? loadBlueReturnAllocation(ctx.calendar_year).allocation;
  const allEntries = loadJournalEntries().entries.map((e) =>
    journalEntrySchema.parse(normalizeJournalEntry(e)),
  );
  const periodEntries = filterJournalsInPeriod(allEntries, ctx.period_from, ctx.period_to);

  let purchases_gross = 0;
  let purchases = 0;
  const expense_by_code_gross = new Map<string, number>();
  const expense_by_code = new Map<string, number>();
  const applications: AllocationApplicationRow[] = [];
  let household_total_yen = 0;

  for (const entry of periodEntries) {
    for (const line of entry.lines) {
      const account = coa.accounts.find((a) => a.code === line.account_code);
      if (!account || account.type !== "expense") continue;
      const gross = line.debit_yen - line.credit_yen;
      if (gross === 0) continue;
      const absGross = Math.abs(gross);
      const resolved = resolveBusinessPct(allocation, account.code, entry.entry_id);
      const { business_yen, household_yen } = allocateYen(absGross, resolved.business_pct);
      applications.push({
        entry_id: entry.entry_id,
        account_code: account.code,
        gross_yen: absGross,
        business_pct: resolved.business_pct,
        business_yen,
        household_yen,
        method: resolved.method,
        notes: resolved.notes,
      });
      household_total_yen += household_yen;
      if (account.statement_section === "cogs" || account.code === "5000") {
        purchases_gross += absGross;
        purchases += business_yen;
      } else {
        expense_by_code_gross.set(
          account.code,
          (expense_by_code_gross.get(account.code) ?? 0) + absGross,
        );
        expense_by_code.set(
          account.code,
          (expense_by_code.get(account.code) ?? 0) + business_yen,
        );
      }
    }
  }

  return {
    purchases_gross,
    purchases,
    expense_by_code_gross,
    expense_by_code,
    applications,
    household_total_yen,
  };
}

export function hasSolePropDoubleEntryCoa(coa?: ChartOfAccounts): boolean {
  const chart = coa ?? loadChartOfAccounts();
  const codes = new Set(chart.accounts.map((a) => a.code));
  return codes.has("3100") && codes.has("4100") && (codes.has("3210") || codes.has("3220"));
}

export function assessBooksReady(calendarYear: number): {
  booksReady: boolean;
  has_journal_book: boolean;
  has_general_ledger: boolean;
  has_kessan: boolean;
} {
  const dir = join(getDocsDir(), "finance", "blue-return", String(calendarYear));
  const has_journal_book = existsSync(join(dir, "shiwakecho.md"));
  const has_general_ledger = existsSync(join(dir, "sokanjomotocho.md"));
  const has_kessan = existsSync(join(dir, "aoiro-kessansho.md"));
  return {
    // 主要簿（仕訳帳・総勘定元帳）。決算書は本関数呼び出し後に書くため必須にしない。
    booksReady: has_journal_book && has_general_ledger,
    has_journal_book,
    has_general_ledger,
    has_kessan,
  };
}

export type BlueReturnDeductionGate = {
  calendar_year: number;
  double_entry: boolean;
  entity_ok: boolean;
  books_ready: boolean;
  has_balance_sheet: boolean;
  has_profit_loss: boolean;
  business_income_yen: number;
  etax_evidence: boolean;
  denshi_yuryo_evidence: boolean;
  year_mismatch: boolean;
  eligible_cap_yen: number;
  applied_deduction_yen: number;
  notes: string[];
  future_note: string;
};

export function assessBlueReturnDeduction(input: {
  calendarYear?: number;
  businessIncomeYen: number;
  filing?: BlueReturnFiling;
  yearMismatch?: boolean;
  doubleEntry?: boolean;
  entityOk?: boolean;
  booksReady?: boolean;
  hasBalanceSheet?: boolean;
  hasProfitLoss?: boolean;
}): BlueReturnDeductionGate {
  const ctx = resolveBlueReturnYear(input.calendarYear);
  const loaded =
    input.filing != null
      ? { filing: input.filing, year_mismatch: Boolean(input.yearMismatch) }
      : loadBlueReturnFiling(ctx.calendar_year);
  const filing = loaded.filing;
  const year_mismatch = input.yearMismatch ?? loaded.year_mismatch;
  // 未指定は未確認扱い（55万を名乗らない）
  const double_entry = input.doubleEntry ?? false;
  const entity_ok = input.entityOk ?? false;
  const books_ready = input.booksReady ?? false;
  const has_balance_sheet = input.hasBalanceSheet ?? false;
  const has_profit_loss = input.hasProfitLoss ?? false;

  const notes: string[] = [];
  if (year_mismatch) {
    notes.push(
      `warning: blue-return-filing.yaml の calendar_year=${filing.calendar_year ?? "—"} が要求年 ${ctx.calendar_year} と不一致（証跡は年一致時のみ採用）`,
    );
  }

  const evidenceOk = !year_mismatch;
  const etax = evidenceOk && Boolean(filing.etax_submitted_at);
  const denshi = evidenceOk && Boolean(filing.denshi_yuryo_notified_at);

  const complexOk =
    double_entry && entity_ok && books_ready && has_balance_sheet && has_profit_loss;

  let eligible_cap_yen = BLUE_RETURN_DEDUCTION_10;
  if (!complexOk) {
    notes.push(
      "複式・entity・帳簿出力・BS/PL の確認が未充足のため、55万円控除を名乗らない（簡易 10万円相当）",
    );
    if (!double_entry) notes.push("CoA に元入金・売上等の個人事業主科目が不足");
    if (!entity_ok) notes.push("tenant entity_form が sole_proprietorship ではない");
    if (!books_ready) notes.push("仕訳帳・総勘定元帳の出力が未生成");
    if (!has_balance_sheet) notes.push("貸借対照表（計算）未確認");
    if (!has_profit_loss) notes.push("損益計算書（計算）未確認");
  } else {
    eligible_cap_yen = BLUE_RETURN_DEDUCTION_55;
    notes.push("複式（正規の簿記）· 貸借対照表· 損益計算書 → 最高55万円（国税庁 No.2072）");
    if (etax || denshi) {
      eligible_cap_yen = BLUE_RETURN_DEDUCTION_65;
      notes.push(
        etax
          ? "e-Tax 提出証跡あり → 最高65万円"
          : "優良電子帳簿届出証跡あり → 最高65万円",
      );
    } else {
      notes.push("e-Tax / 優良電帳の証跡なし → 55万円まで（OrgOS は e-Tax を送信しない）");
    }
  }

  const applied = Math.max(
    0,
    Math.min(eligible_cap_yen, Math.max(0, input.businessIncomeYen)),
  );
  if (input.businessIncomeYen <= 0) {
    notes.push("事業所得が0以下のため青色申告特別控除の適用額は0円");
  } else if (applied < eligible_cap_yen) {
    notes.push(`適用額は事業所得 ${input.businessIncomeYen.toLocaleString("ja-JP")} 円を上限`);
  }

  return {
    calendar_year: ctx.calendar_year,
    double_entry,
    entity_ok,
    books_ready,
    has_balance_sheet,
    has_profit_loss,
    business_income_yen: input.businessIncomeYen,
    etax_evidence: etax,
    denshi_yuryo_evidence: denshi,
    year_mismatch,
    eligible_cap_yen,
    applied_deduction_yen: applied,
    notes,
    future_note:
      "令和9年分以後は制度改正で最大75万円等の区分がある。本ゲートは令和8年分までの55/65を対象とする。",
  };
}

/** 所得税速算表（課税所得に対する税額）。復興特別所得税は別計算。 */
export function computeIncomeTaxYen(taxableIncomeYen: number): number {
  const x = Math.max(0, Math.floor(taxableIncomeYen));
  if (x <= 1_949_000) return Math.floor(x * 0.05);
  if (x <= 3_299_000) return Math.floor(x * 0.1 - 97_500);
  if (x <= 6_949_000) return Math.floor(x * 0.2 - 427_500);
  if (x <= 8_999_000) return Math.floor(x * 0.23 - 636_000);
  if (x <= 17_999_000) return Math.floor(x * 0.33 - 1_536_000);
  if (x <= 39_999_000) return Math.floor(x * 0.4 - 2_796_000);
  return Math.floor(x * 0.45 - 4_796_000);
}

export function computeReconstructionSurtaxYen(incomeTaxYen: number): number {
  return Math.floor(Math.max(0, incomeTaxYen) * RECONSTRUCTION_SURTAX_RATE);
}

function buildStatutoryExpenseLines(
  expenseByCode: Map<string, number>,
  map: z.output<typeof expenseLineMapSchema>,
): Array<{ label: string; amount_yen: number }> {
  const buckets = new Map<string, number>();
  for (const label of STATUTORY_EXPENSE_LINES) buckets.set(label, 0);
  for (const [code, amount] of expenseByCode) {
    const label = map.lines[code] ?? map.default_expense_line;
    const key = buckets.has(label) ? label : map.default_expense_line;
    buckets.set(key, (buckets.get(key) ?? 0) + amount);
  }
  return STATUTORY_EXPENSE_LINES.map((label) => ({
    label,
    amount_yen: buckets.get(label) ?? 0,
  }));
}

function balanceLinesForCodes(
  bs: ReturnType<typeof buildBalanceSheet>,
  codes: readonly string[],
  coa: ChartOfAccounts,
  section: "asset" | "liability" | "equity",
): Array<{ label: string; amount_yen: number }> {
  const fromBs =
    section === "asset" ? bs.assets : section === "liability" ? bs.liabilities : bs.equity;
  const byCode = new Map(fromBs.map((l) => [l.account_code, l.balance_yen]));
  return codes
    .filter((code) => coa.accounts.some((a) => a.code === code))
    .map((code) => {
      const account = coa.accounts.find((a) => a.code === code);
      return {
        label: account?.name ?? code,
        amount_yen: byCode.get(code) ?? 0,
      };
    });
}

export type BlueReturnKessan = {
  calendar_year: number;
  year_label: string;
  period_from: string;
  period_to: string;
  revenue_yen: number;
  beginning_inventory_yen: number;
  purchases_yen: number;
  purchases_gross_yen: number;
  ending_inventory_yen: number;
  cost_of_sales_yen: number;
  gross_profit_yen: number;
  expenses_yen: number;
  expenses_gross_yen: number;
  expense_lines: Array<{ label: string; amount_yen: number }>;
  income_before_blue_deduction_yen: number;
  blue_deduction_yen: number;
  business_income_yen: number;
  allocation: {
    household_total_yen: number;
    applications: AllocationApplicationRow[];
    notes: string[];
  };
  balance_sheet: {
    assets: Array<{ label: string; amount_yen: number }>;
    liabilities_equity: Array<{ label: string; amount_yen: number }>;
    total_assets_yen: number;
    total_liabilities_equity_yen: number;
    balanced: boolean;
    income_before_on_bs_yen: number;
  };
  issues: string[];
};

export function buildBlueReturnKessan(calendarYear?: number): BlueReturnKessan {
  const ctx = resolveBlueReturnYear(calendarYear);
  const coa = loadChartOfAccounts();
  const map = loadExpenseLineMap();
  const { allocation, notes: allocNotes } = loadBlueReturnAllocation(ctx.calendar_year);
  const pl = buildCalendarYearPl({ calendarYear: ctx.calendar_year, coa });
  const costs = buildAllocatedPeriodCosts({
    calendarYear: ctx.calendar_year,
    coa,
    allocation,
  });
  const expenseLines = buildStatutoryExpenseLines(costs.expense_by_code, map);
  const expenses = expenseLines.reduce((s, r) => s + r.amount_yen, 0);
  const expensesGross = [...costs.expense_by_code_gross.values()].reduce((s, n) => s + n, 0);
  const beginningInventory = inventoryBalance(ctx.prior_as_of, "1210");
  const endingInventory = inventoryBalance(ctx.as_of, "1210");
  const costOfSales = beginningInventory + costs.purchases - endingInventory;
  const gross = pl.revenue_total - costOfSales;
  const incomeBefore = gross - expenses;

  const cfg = loadTenantConfig();
  const entityOk = cfg.entity_form === "sole_proprietorship";
  const doubleEntry = hasSolePropDoubleEntryCoa(coa);
  const books = assessBooksReady(ctx.calendar_year);
  const { filing, year_mismatch } = loadBlueReturnFiling(ctx.calendar_year);

  const gate = assessBlueReturnDeduction({
    calendarYear: ctx.calendar_year,
    businessIncomeYen: incomeBefore,
    filing,
    yearMismatch: year_mismatch,
    doubleEntry,
    entityOk,
    booksReady: books.booksReady,
    hasBalanceSheet: true,
    hasProfitLoss: true,
  });
  const businessIncome = incomeBefore - gate.applied_deduction_yen;

  const bs = buildBalanceSheet({ asOf: ctx.as_of });
  const assetLines = balanceLinesForCodes(bs, MAJOR_ASSET_CODES, coa, "asset");
  const liabilityLines = balanceLinesForCodes(bs, MAJOR_LIABILITY_CODES, coa, "liability");
  const equityLines = balanceLinesForCodes(bs, MAJOR_EQUITY_CODES, coa, "equity");
  const incomeLine = {
    label: "所得金額（青色申告特別控除前）",
    amount_yen: incomeBefore,
  };
  const leLines = [...liabilityLines, ...equityLines, incomeLine];
  const totalAssets = assetLines.reduce((s, r) => s + r.amount_yen, 0);
  const totalLE = leLines.reduce((s, r) => s + r.amount_yen, 0);
  const issues: string[] = [];
  if (Math.abs(totalAssets - totalLE) > 1) {
    issues.push(
      `貸借不一致: 資産 ${totalAssets} vs 負債・資本 ${totalLE}（控除前所得の転記を確認）`,
    );
  }
  const drawOnEquity = bs.equity.find((l) => l.account_code === "3210");
  if (drawOnEquity && drawOnEquity.balance_yen < 0) {
    issues.push(
      "事業主貸が純資産側で負表示のまま（buildBalanceSheet 一本化の回帰）",
    );
  }
  const drawByCode = bs.assets.find((l) => l.account_code === "3210");
  if (drawByCode && drawByCode.balance_yen < 0) {
    issues.push(`事業主貸が資産側で負: ${drawByCode.balance_yen}`);
  }
  const incomeOnBs = incomeLine.amount_yen;
  if (Math.abs(incomeOnBs - incomeBefore) > 0) {
    issues.push(
      `BS 所得金額（${incomeOnBs}）と PL 控除前所得（${incomeBefore}）が不一致`,
    );
  }
  issues.push(...collectSetupGateWarnings(ctx.calendar_year));

  return {
    calendar_year: ctx.calendar_year,
    year_label: ctx.year_label,
    period_from: ctx.period_from,
    period_to: ctx.period_to,
    revenue_yen: pl.revenue_total,
    beginning_inventory_yen: beginningInventory,
    purchases_yen: costs.purchases,
    purchases_gross_yen: costs.purchases_gross,
    ending_inventory_yen: endingInventory,
    cost_of_sales_yen: costOfSales,
    gross_profit_yen: gross,
    expenses_yen: expenses,
    expenses_gross_yen: expensesGross,
    expense_lines: expenseLines,
    income_before_blue_deduction_yen: incomeBefore,
    blue_deduction_yen: gate.applied_deduction_yen,
    business_income_yen: businessIncome,
    allocation: {
      household_total_yen: costs.household_total_yen,
      applications: costs.applications,
      notes: allocNotes,
    },
    balance_sheet: {
      assets: assetLines,
      liabilities_equity: leLines,
      total_assets_yen: totalAssets,
      total_liabilities_equity_yen: totalLE,
      balanced: Math.abs(totalAssets - totalLE) <= 1,
      income_before_on_bs_yen: incomeOnBs,
    },
    issues,
  };
}

export type FormBDraft = {
  calendar_year: number;
  year_label: string;
  business_revenue_yen: number;
  business_income_yen: number;
  dividend_income_yen: number;
  interest_income_yen: number;
  miscellaneous_income_yen: number;
  total_income_yen: number;
  basic_deduction_yen: number;
  income_deductions_yen: number;
  income_deduction_lines: Array<{ label: string; amount_yen: number }>;
  income_deductions_missing: boolean;
  blue_deduction_yen: number;
  taxable_income_yen: number;
  income_tax_yen: number;
  reconstruction_surtax_yen: number;
  tax_payable_yen: number;
  deduction_gate: BlueReturnDeductionGate;
};

export function loadBlueReturnIncomeDeductions(
  calendarYear?: number,
): { deductions: BlueReturnIncomeDeductions | null; missing: boolean } {
  const path = join(getDataDir(), "finance", "blue-return-income-deductions.yaml");
  if (!existsSync(path)) {
    return { deductions: null, missing: true };
  }
  const raw = readYamlFile(path, blueReturnIncomeDeductionsSchema);
  if (calendarYear != null && raw.calendar_year !== calendarYear) {
    // Year mismatch must not leak amounts into Form B / BFF capped totals.
    return { deductions: null, missing: true };
  }
  return { deductions: raw, missing: false };
}

export function sumCappedIncomeDeductions(
  d: BlueReturnIncomeDeductions,
): { total: number; lines: Array<{ label: string; amount_yen: number }> } {
  const life = Math.min(d.life_insurance_yen, LIFE_INSURANCE_DEDUCTION_CAP_YEN);
  const quake = Math.min(d.earthquake_insurance_yen, EARTHQUAKE_INSURANCE_DEDUCTION_CAP_YEN);
  const lines = [
    { label: "社会保険料控除", amount_yen: d.social_insurance_yen },
    { label: "生命保険料控除（cap 後）", amount_yen: life },
    { label: "地震保険料控除（cap 後）", amount_yen: quake },
    { label: "配偶者（特別）控除", amount_yen: d.spouse_special_yen },
    { label: "扶養控除", amount_yen: d.dependents_yen },
    { label: "小規模企業共済等掛金控除", amount_yen: d.small_enterprise_mutual_yen },
  ].filter((l) => l.amount_yen > 0);
  const total = lines.reduce((s, l) => s + l.amount_yen, 0);
  return { total, lines };
}

export function buildFormBDraft(calendarYear?: number): FormBDraft {
  const kessan = buildBlueReturnKessan(calendarYear);
  const cfg = loadTenantConfig();
  const coa = loadChartOfAccounts();
  const books = assessBooksReady(kessan.calendar_year);
  const { filing, year_mismatch } = loadBlueReturnFiling(kessan.calendar_year);
  const gate = assessBlueReturnDeduction({
    calendarYear: kessan.calendar_year,
    businessIncomeYen: kessan.income_before_blue_deduction_yen,
    filing,
    yearMismatch: year_mismatch,
    doubleEntry: hasSolePropDoubleEntryCoa(coa),
    entityOk: cfg.entity_form === "sole_proprietorship",
    booksReady: books.booksReady,
    hasBalanceSheet: true,
    hasProfitLoss: true,
  });
  let dividend_income_yen = 0;
  let interest_income_yen = 0;
  let miscellaneous_income_yen = 0;
  const setup = loadBlueReturnSetup();
  // other_income only when setup calendar_year matches the draft year.
  if (setup?.other_income && setup.calendar_year === kessan.calendar_year) {
    dividend_income_yen = setup.other_income.dividend_yen ?? 0;
    interest_income_yen = setup.other_income.interest_yen ?? 0;
    miscellaneous_income_yen = setup.other_income.miscellaneous_yen ?? 0;
  }
  const totalIncome =
    kessan.business_income_yen +
    dividend_income_yen +
    interest_income_yen +
    miscellaneous_income_yen;
  const { deductions, missing: income_deductions_missing } = loadBlueReturnIncomeDeductions(
    kessan.calendar_year,
  );
  const capped =
    deductions && !income_deductions_missing
      ? sumCappedIncomeDeductions(deductions)
      : { total: 0, lines: [] as Array<{ label: string; amount_yen: number }> };
  const taxable = truncateTaxableIncomeYen(
    totalIncome - BASIC_DEDUCTION_YEN - capped.total,
  );
  const income_tax_yen = computeIncomeTaxYen(taxable);
  const reconstruction_surtax_yen = computeReconstructionSurtaxYen(income_tax_yen);
  return {
    calendar_year: kessan.calendar_year,
    year_label: kessan.year_label,
    business_revenue_yen: kessan.revenue_yen,
    business_income_yen: kessan.business_income_yen,
    dividend_income_yen,
    interest_income_yen,
    miscellaneous_income_yen,
    total_income_yen: totalIncome,
    basic_deduction_yen: BASIC_DEDUCTION_YEN,
    income_deductions_yen: capped.total,
    income_deduction_lines: capped.lines,
    income_deductions_missing,
    blue_deduction_yen: gate.applied_deduction_yen,
    taxable_income_yen: taxable,
    income_tax_yen,
    reconstruction_surtax_yen,
    tax_payable_yen: income_tax_yen + reconstruction_surtax_yen,
    deduction_gate: gate,
  };
}

function yen(n: number): string {
  return n.toLocaleString("ja-JP");
}

function counterpartLabel(
  entry: JournalEntry,
  focusCode: string,
  coa: ChartOfAccounts,
): string {
  const others = entry.lines.filter((l) => l.account_code !== focusCode);
  if (!others.length) return "—";
  return others
    .map((l) => {
      const name = coa.accounts.find((a) => a.code === l.account_code)?.name ?? l.account_code;
      return name;
    })
    .join("・");
}

function accountBalanceAsOf(asOf: string, accountCode: string): number {
  const trial = buildTrialBalance({ asOf });
  const row = trial.rows.find((r) => r.account_code === accountCode);
  return row?.balance_yen ?? 0;
}

function buildCashDepositBookSection(
  title: string,
  accountCode: string,
  entries: JournalEntry[],
  coa: ChartOfAccounts,
  periodFrom: string,
  priorAsOf: string,
): string {
  const lines: string[] = [
    `## ${title}（${accountCode}）`,
    "",
    "| 日付 | 相手科目 | 摘要 | 収入 | 支出 | 残高 |",
    "|------|----------|------|-----:|-----:|-----:|",
  ];
  let balance = accountBalanceAsOf(priorAsOf, accountCode);
  lines.push(
    `| ${priorAsOf} | — | 期首繰越 | 0 | 0 | ${yen(balance)} |`,
  );
  const sorted = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let rows = 0;
  for (const entry of sorted) {
    for (const line of entry.lines) {
      if (line.account_code !== accountCode) continue;
      const income = line.debit_yen;
      const expense = line.credit_yen;
      balance += income - expense;
      lines.push(
        `| ${entry.occurred_at.slice(0, 10)} | ${counterpartLabel(entry, accountCode, coa)} | ${entry.description} | ${yen(income)} | ${yen(expense)} | ${yen(balance)} |`,
      );
      rows += 1;
    }
  }
  if (rows === 0) {
    lines.push(`| ${periodFrom} | — | 当期発生なし | 0 | 0 | ${yen(balance)} |`);
  }
  return lines.join("\n");
}

function buildCashBookMd(
  entries: JournalEntry[],
  coa: ChartOfAccounts,
  periodFrom: string,
  priorAsOf: string,
): string {
  const codes = new Set(coa.accounts.map((a) => a.code));
  const sections: string[] = [];
  if (codes.has("1110") || codes.has("1120")) {
    if (codes.has("1110")) {
      sections.push(
        buildCashDepositBookSection("現金出納帳", "1110", entries, coa, periodFrom, priorAsOf),
      );
    }
    if (codes.has("1120")) {
      sections.push(
        buildCashDepositBookSection("預金出納帳", "1120", entries, coa, periodFrom, priorAsOf),
      );
    }
  } else {
    sections.push(
      buildCashDepositBookSection("現金・預金出納帳", "1100", entries, coa, periodFrom, priorAsOf),
    );
  }
  return sections.join("\n\n");
}

function buildSubLedgerMd(
  title: string,
  accountCode: string,
  entries: JournalEntry[],
  coa: ChartOfAccounts,
  periodFrom: string,
  priorAsOf: string,
): string {
  const account = coa.accounts.find((a) => a.code === accountCode);
  const normal = account?.normal_balance ?? "debit";
  const lines: string[] = [
    `## ${title}（${accountCode}）`,
    "",
    "| 日付 | 相手科目 | 摘要 | 借方 | 貸方 | 残高 |",
    "|------|----------|------|-----:|-----:|-----:|",
  ];
  let balance = accountBalanceAsOf(priorAsOf, accountCode);
  lines.push(
    `| ${priorAsOf} | — | 期首繰越 | 0 | 0 | ${yen(balance)} |`,
  );
  let rows = 0;
  const sorted = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  for (const entry of sorted) {
    for (const line of entry.lines) {
      if (line.account_code !== accountCode) continue;
      const delta =
        normal === "debit"
          ? line.debit_yen - line.credit_yen
          : line.credit_yen - line.debit_yen;
      balance += delta;
      lines.push(
        `| ${entry.occurred_at.slice(0, 10)} | ${counterpartLabel(entry, accountCode, coa)} | ${entry.description} | ${yen(line.debit_yen)} | ${yen(line.credit_yen)} | ${yen(balance)} |`,
      );
      rows += 1;
    }
  }
  if (rows === 0) {
    lines.push(`| ${periodFrom} | — | 当期発生なし | 0 | 0 | ${yen(balance)} |`);
  }
  return lines.join("\n");
}

function buildExpenseBookMd(
  entries: JournalEntry[],
  coa: ChartOfAccounts,
  map: z.output<typeof expenseLineMapSchema>,
  allocation: BlueReturnAllocation,
  periodFrom: string,
): string {
  const lines: string[] = [
    "## 経費帳",
    "",
    "| 日付 | 経費区分 | 科目 | 摘要 | 総額 | 事業% | 事業分 |",
    "|------|----------|------|------|-----:|-----:|------:|",
  ];
  let rows = 0;
  const sorted = [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  for (const entry of sorted) {
    for (const line of entry.lines) {
      const account = coa.accounts.find((a) => a.code === line.account_code);
      if (!account || account.type !== "expense") continue;
      if (account.statement_section === "cogs" || account.code === "5000") continue;
      const amount = line.debit_yen - line.credit_yen;
      if (amount === 0) continue;
      const abs = Math.abs(amount);
      const resolved = resolveBusinessPct(allocation, account.code, entry.entry_id);
      const { business_yen } = allocateYen(abs, resolved.business_pct);
      const label = map.lines[account.code] ?? map.default_expense_line;
      lines.push(
        `| ${entry.occurred_at.slice(0, 10)} | ${label} | ${account.name} | ${entry.description} | ${yen(abs)} | ${resolved.business_pct} | ${yen(business_yen)} |`,
      );
      rows += 1;
    }
  }
  if (rows === 0) {
    lines.push(`| ${periodFrom} | — | — | 当期発生なし | 0 | 100 | 0 |`);
  }
  return lines.join("\n");
}

export function writeBooksPack(calendarYear?: number): { paths: string[]; period_entry_count: number } {
  const ctx = resolveBlueReturnYear(calendarYear);
  const cfg = loadTenantConfig();
  const coa = loadChartOfAccounts();
  const map = loadExpenseLineMap();
  const { allocation } = loadBlueReturnAllocation(ctx.calendar_year);
  const allEntries = loadJournalEntries().entries.map((e) =>
    journalEntrySchema.parse(normalizeJournalEntry(e)),
  );
  const periodEntries = filterJournalsInPeriod(allEntries, ctx.period_from, ctx.period_to);
  const paths: string[] = [];
  const header = [
    `# ${ctx.year_label} · ${cfg.name}`,
    "",
    `期間: ${ctx.period_from} 〜 ${ctx.period_to}`,
    "記帳: 複式（正規の簿記）",
    "正本: `data/finance/journal-entries.yaml`",
    "",
  ].join("\n");

  const journalRows =
    periodEntries.length === 0
      ? "| — | — | — | — | — | — |\n| — | — | 当期仕訳なし | 0 | 0 | — |"
      : periodEntries
          .flatMap((e) => {
            const date = e.occurred_at.slice(0, 10);
            return e.lines.map(
              (line, i) =>
                `| ${i === 0 ? date : ""} | ${e.entry_id} | ${line.account_code} | ${yen(line.debit_yen)} | ${yen(line.credit_yen)} | ${i === 0 ? e.description : ""} |`,
            );
          })
          .join("\n");

  paths.push(
    writeBlueDoc(
      ctx.calendar_year,
      "shiwakecho.md",
      [
        header,
        "# 仕訳帳",
        "",
        "| 日付 | 伝票番号 | 科目 | 借方 | 貸方 | 摘要 |",
        "|------|----------|------|-----:|-----:|------|",
        journalRows,
        "",
        `件数: ${periodEntries.length}（期間内）`,
      ].join("\n"),
    ),
  );

  const glSections: string[] = [header, "# 総勘定元帳", ""];
  for (const account of coa.accounts) {
    const gl = buildGeneralLedger({
      accountCode: account.code,
      from: ctx.period_from,
      to: ctx.period_to,
    });
    glSections.push(`## ${account.code} ${account.name}`);
    glSections.push("");
    glSections.push("| 日付 | 伝票 | 摘要 | 借方 | 貸方 | 残高 |");
    glSections.push("|------|------|------|-----:|-----:|-----:|");
    if (gl.lines.length === 0) {
      glSections.push("| — | — | 発生なし | 0 | 0 | 0 |");
    } else {
      for (const line of gl.lines) {
        glSections.push(
          `| ${line.occurred_at.slice(0, 10)} | ${line.entry_id} | ${line.description} | ${yen(line.debit_yen)} | ${yen(line.credit_yen)} | ${yen(line.running_balance_yen)} |`,
        );
      }
    }
    glSections.push("");
    glSections.push(`期末残高: ${yen(gl.ending_balance_yen)} 円`);
    glSections.push("");
  }
  paths.push(writeBlueDoc(ctx.calendar_year, "sokanjomotocho.md", glSections.join("\n")));

  const trial = buildTrialBalance({ asOf: ctx.as_of });
  paths.push(
    writeBlueDoc(
      ctx.calendar_year,
      "shisanhyo.md",
      [
        header,
        `# 試算表 · ${ctx.as_of}`,
        "",
        "注記: as-of 累積試算（損益未締め含む）。年フィルタ対象は仕訳帳・暦年PL・補助簿の当期発生行。",
        "",
        "| コード | 科目 | 借方 | 貸方 | 残高 |",
        "|--------|------|-----:|-----:|-----:|",
        ...trial.rows.map(
          (r) =>
            `| ${r.account_code} | ${r.account_name} | ${yen(r.debit_total_yen)} | ${yen(r.credit_total_yen)} | ${yen(r.balance_yen)} |`,
        ),
        `| | 合計 | ${yen(trial.debit_total_yen)} | ${yen(trial.credit_total_yen)} | — |`,
        "",
        `貸借一致: ${trial.balanced ? "はい" : "いいえ"}`,
      ].join("\n"),
    ),
  );

  paths.push(
    writeBlueDoc(
      ctx.calendar_year,
      "hojobo.md",
      [
        header,
        "# 補助簿（GL連動 · 期首繰越あり）",
        "",
        buildCashBookMd(periodEntries, coa, ctx.period_from, ctx.prior_as_of),
        "",
        buildSubLedgerMd("売掛帳", "1150", periodEntries, coa, ctx.period_from, ctx.prior_as_of),
        "",
        buildSubLedgerMd("買掛帳", "2110", periodEntries, coa, ctx.period_from, ctx.prior_as_of),
        "",
        buildExpenseBookMd(periodEntries, coa, map, allocation, ctx.period_from),
      ].join("\n"),
    ),
  );

  let fixedMd = [
    header,
    "# 固定資産台帳",
    "",
    "| 資産番号 | 名称 | 取得日 | 取得価額 | 期末帳簿価額 |",
    "|----------|------|--------|--------:|------------:|",
  ].join("\n");
  try {
    const fa = loadFixedAssets();
    if (!fa.assets.length) {
      fixedMd += "\n| — | 登録資産なし | — | 0 | 0 |\n";
    } else {
      for (const a of fa.assets) {
        fixedMd += `\n| ${a.id} | ${a.name} | ${a.acquisition_date ?? "—"} | ${yen(a.acquisition_cost ?? 0)} | ${yen(a.book_value ?? 0)} |`;
      }
      fixedMd += "\n";
    }
  } catch {
    fixedMd += "\n| — | 台帳未作成 | — | 0 | 0 |\n";
  }
  paths.push(writeBlueDoc(ctx.calendar_year, "koteishisan.md", fixedMd));

  paths.push(
    writeBlueDoc(
      ctx.calendar_year,
      "tanaoroshi.md",
      [
        header,
        "# 棚卸表",
        "",
        `| 期首棚卸高（${ctx.prior_as_of}） | ${yen(inventoryBalance(ctx.prior_as_of, "1210"))} 円 |`,
        `| 期末棚卸高（${ctx.as_of}） | ${yen(inventoryBalance(ctx.as_of, "1210"))} 円 |`,
        "",
        "明細行なし（商品・製品・仕掛品の登録なし）。",
      ].join("\n"),
    ),
  );

  paths.push(
    writeBlueDoc(
      ctx.calendar_year,
      "00-README.md",
      [
        `# ${ctx.year_label} 複式帳簿パック`,
        "",
        "国税庁「帳簿の記帳のしかた」に沿う保存用ドラフト（7年保存対象の主要簿・補助簿）。",
        "行政提出・e-Tax 送信ファイルではない。",
        "",
        "## 主要簿・補助簿",
        "",
        "| 書類 | リンク |",
        "|------|--------|",
        "| 仕訳帳 | [shiwakecho.md](./shiwakecho.md) |",
        "| 総勘定元帳 | [sokanjomotocho.md](./sokanjomotocho.md) |",
        "| 試算表 | [shisanhyo.md](./shisanhyo.md) |",
        "| 補助簿（GL連動） | [hojobo.md](./hojobo.md) |",
        "| 固定資産台帳 | [koteishisan.md](./koteishisan.md) |",
        "| 棚卸表 | [tanaoroshi.md](./tanaoroshi.md) |",
        "",
        "## 税務書類",
        "",
        "| 書類 | リンク |",
        "|------|--------|",
        "| 青色申告決算書 | [aoiro-kessansho.md](./aoiro-kessansho.md) |",
        "| 確定申告書B | [kakutei-shinkoku-b.md](./kakutei-shinkoku-b.md) |",
        "| 税理士引き渡し | [handoff.md](./handoff.md) |",
        `| 税務報告書インデックス | [tax-report-index.md](../../statements/${ctx.calendar_year}/tax-report-index.md) |`,
      ].join("\n"),
    ),
  );

  return { paths, period_entry_count: periodEntries.length };
}

export function writeKessanDraft(calendarYear?: number): { path: string; kessan: BlueReturnKessan } {
  const kessan = buildBlueReturnKessan(calendarYear);
  const cfg = loadTenantConfig();
  const lines = [
    `# 青色申告決算書（一般用）ドラフト — ${kessan.year_label}`,
    "",
    "| 項目 | 内容 |",
    "|------|------|",
    `| 屋号 / 氏名 | ${cfg.name} |`,
    `| 期間 | ${kessan.period_from} 〜 ${kessan.period_to} |`,
    "| 位置づけ | 行政様式 PDF / e-Tax ではない。税理士転記用 |",
    "",
    "## 関連書類",
    "",
    "| 書類 | リンク |",
    "|------|--------|",
    "| 確定申告書B | [kakutei-shinkoku-b.md](./kakutei-shinkoku-b.md) |",
    "| 控除ゲート | [deduction-gate.md](./deduction-gate.md) |",
    "| 税理士引き渡し | [handoff.md](./handoff.md) |",
    `| 損益計算書（GL） | [pl.md](../../statements/${kessan.calendar_year}/pl.md) |`,
    `| 貸借対照表（GL） | [bs.md](../../statements/${kessan.calendar_year}/bs.md) |`,
    `| 税務報告書インデックス | [tax-report-index.md](../../statements/${kessan.calendar_year}/tax-report-index.md) |`,
    "",
    "## 損益計算書",
    "",
    "| 科目 | 金額（円） |",
    "|------|----------:|",
    `| 売上（収入）金額 | ${yen(kessan.revenue_yen)} |`,
    `| 期首商品棚卸高 | ${yen(kessan.beginning_inventory_yen)} |`,
    `| 仕入金額 | ${yen(kessan.purchases_yen)} |`,
    `| 期末商品棚卸高 | ${yen(kessan.ending_inventory_yen)} |`,
    `| 差引原価 | ${yen(kessan.cost_of_sales_yen)} |`,
    `| 差引金額 | ${yen(kessan.gross_profit_yen)} |`,
    ...kessan.expense_lines.map((e) => `| ${e.label} | ${yen(e.amount_yen)} |`),
    `| 経費計 | ${yen(kessan.expenses_yen)} |`,
    `| 青色申告特別控除前の所得金額 | ${yen(kessan.income_before_blue_deduction_yen)} |`,
    `| 青色申告特別控除額 | ${yen(kessan.blue_deduction_yen)} |`,
    `| 所得金額 | ${yen(kessan.business_income_yen)} |`,
    "",
    "## 貸借対照表",
    "",
    "| 資産の部 | 円 | 負債・資本の部 | 円 |",
    "|----------|--:|----------------|--:|",
  ];
  const max = Math.max(
    kessan.balance_sheet.assets.length,
    kessan.balance_sheet.liabilities_equity.length,
  );
  for (let i = 0; i < max; i++) {
    const a = kessan.balance_sheet.assets[i];
    const b = kessan.balance_sheet.liabilities_equity[i];
    lines.push(
      `| ${a?.label ?? ""} | ${a ? yen(a.amount_yen) : ""} | ${b?.label ?? ""} | ${b ? yen(b.amount_yen) : ""} |`,
    );
  }
  lines.push(
    `| 合計 | ${yen(kessan.balance_sheet.total_assets_yen)} | 合計 | ${yen(kessan.balance_sheet.total_liabilities_equity_yen)} |`,
    "",
    `貸借一致: ${kessan.balance_sheet.balanced ? "はい" : "いいえ"}`,
    `BS所得（控除前）= PL控除前: ${
      Math.abs(
        kessan.balance_sheet.income_before_on_bs_yen - kessan.income_before_blue_deduction_yen,
      ) <= 0
        ? "一致"
        : "不一致"
    }`,
  );
  if (kessan.allocation.household_total_yen > 0 || kessan.allocation.applications.some((a) => a.business_pct < 100)) {
    lines.push(
      "",
      "## 家事・事業按分",
      "",
      `| 経費総額（仕訳） | ${yen(kessan.expenses_gross_yen)} |`,
      `| 経費（事業分） | ${yen(kessan.expenses_yen)} |`,
      `| 家事分合計 | ${yen(kessan.allocation.household_total_yen)} |`,
      "",
      "| 伝票 | 科目 | 総額 | 事業% | 事業分 | 家事分 |",
      "|------|------|-----:|-----:|------:|------:|",
      ...kessan.allocation.applications
        .filter((a) => a.business_pct < 100 || a.household_yen > 0)
        .map(
          (a) =>
            `| ${a.entry_id} | ${a.account_code} | ${yen(a.gross_yen)} | ${a.business_pct} | ${yen(a.business_yen)} | ${yen(a.household_yen)} |`,
        ),
      "",
      ...kessan.allocation.notes.map((n) => `- ${n}`),
    );
  }
  if (kessan.issues.length) {
    lines.push("", "## 検証", "", ...kessan.issues.map((i) => `- ${i}`));
  }
  const path = writeBlueDoc(kessan.calendar_year, "aoiro-kessansho.md", lines.join("\n"));
  return { path, kessan };
}

export function writeFormBDraft(calendarYear?: number): { path: string; draft: FormBDraft } {
  const draft = buildFormBDraft(calendarYear);
  const cfg = loadTenantConfig();
  const path = writeBlueDoc(
    draft.calendar_year,
    "kakutei-shinkoku-b.md",
    [
      `# 確定申告書B（ドラフト）— ${draft.year_label}`,
      "",
      "| 項目 | 内容 |",
      "|------|------|",
      `| 納税者 | ${cfg.name} |`,
      `| 対象年 | ${draft.year_label} |`,
      "| 文書の位置づけ | 第一表の金額欄ドラフト（行政様式・e-Tax XML ではない） |",
      "",
      "## 目次",
      "",
      "- [収入・所得](#収入所得)",
      "- [所得控除](#所得控除)",
      "- [税金の計算](#税金の計算)",
      "- [関連書類](#関連書類)",
      "",
      "> 青色申告特別控除は [青色申告決算書](./aoiro-kessansho.md) 側で差し引き済み。税額は国税庁速算表レベル（課税所得は千円未満切捨て）。提出用ではない。",
      "",
      "## 収入・所得",
      "",
      "| 区分 | 項目 | 金額（円） |",
      "|------|------|----------:|",
      `| 収入金額等 | 事業（営業等） | ${yen(draft.business_revenue_yen)} |`,
      `| 所得金額 | 事業（青色控除後） | ${yen(draft.business_income_yen)} |`,
      ...(draft.dividend_income_yen > 0
        ? [`| 所得金額 | 配当 | ${yen(draft.dividend_income_yen)} |`]
        : []),
      ...(draft.interest_income_yen > 0
        ? [`| 所得金額 | 利子 | ${yen(draft.interest_income_yen)} |`]
        : []),
      ...(draft.miscellaneous_income_yen > 0
        ? [`| 所得金額 | 雑 | ${yen(draft.miscellaneous_income_yen)} |`]
        : []),
      `| 所得金額 | **合計** | **${yen(draft.total_income_yen)}** |`,
      "",
      "## 所得控除",
      "",
      "| 項目 | 金額（円） |",
      "|------|----------:|",
      `| 基礎控除 | ${yen(draft.basic_deduction_yen)} |`,
      ...draft.income_deduction_lines.map((l) => `| ${l.label} | ${yen(l.amount_yen)} |`),
      `| 所得控除合計（基礎除く） | ${yen(draft.income_deductions_yen)} |`,
      `| （参考）青色申告特別控除（決算書適用額） | ${yen(draft.blue_deduction_yen)} |`,
      "",
      draft.income_deductions_missing
        ? "> 注: `data/finance/blue-return-income-deductions.yaml` 未整備または年不一致 — 所得控除は基礎のみ。"
        : "> 所得控除は YAML 手入力（ドラフト用）。法令の完全判定ではない。",
      "",
      "## 税金の計算",
      "",
      "| 項目 | 金額（円） |",
      "|------|----------:|",
      `| 課税される所得金額（千円未満切捨て） | ${yen(draft.taxable_income_yen)} |`,
      `| 所得税 | ${yen(draft.income_tax_yen)} |`,
      `| 復興特別所得税 | ${yen(draft.reconstruction_surtax_yen)} |`,
      `| **申告納税額** | **${yen(draft.tax_payable_yen)}** |`,
      "",
      "## 関連書類",
      "",
      "| 書類 | リンク |",
      "|------|--------|",
      "| 青色申告決算書 | [aoiro-kessansho.md](./aoiro-kessansho.md) |",
      "| 青色特別控除ゲート | [deduction-gate.md](./deduction-gate.md) |",
      "| 税理士引き渡し | [handoff.md](./handoff.md) |",
      "| 損益計算書（GL） | [pl.md](../../statements/" + String(draft.calendar_year) + "/pl.md) |",
      "| 貸借対照表（GL） | [bs.md](../../statements/" + String(draft.calendar_year) + "/bs.md) |",
      "",
      "### 控除ゲート要約",
      "",
      "| 項目 | 金額（円） |",
      "|------|----------:|",
      `| 適用上限（cap） | ${yen(draft.deduction_gate.eligible_cap_yen)} |`,
      `| 適用額 | ${yen(draft.deduction_gate.applied_deduction_yen)} |`,
      "",
      ...draft.deduction_gate.notes.map((n) => `- ${n}`),
      "",
      draft.deduction_gate.future_note,
      "",
      "出典: [国税庁 No.2072 青色申告特別控除](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm)",
    ].join("\n"),
  );
  return { path, draft };
}

export function writeDeductionGateReport(calendarYear?: number): {
  path: string;
  gate: BlueReturnDeductionGate;
} {
  const kessan = buildBlueReturnKessan(calendarYear);
  const cfg = loadTenantConfig();
  const coa = loadChartOfAccounts();
  const books = assessBooksReady(kessan.calendar_year);
  const { filing, year_mismatch } = loadBlueReturnFiling(kessan.calendar_year);
  const gate = assessBlueReturnDeduction({
    calendarYear: kessan.calendar_year,
    businessIncomeYen: kessan.income_before_blue_deduction_yen,
    filing,
    yearMismatch: year_mismatch,
    doubleEntry: hasSolePropDoubleEntryCoa(coa),
    entityOk: cfg.entity_form === "sole_proprietorship",
    booksReady: books.booksReady,
    hasBalanceSheet: true,
    hasProfitLoss: true,
  });
  const yesNo = (v: boolean) => (v ? "はい" : "いいえ");
  const path = writeBlueDoc(
    gate.calendar_year,
    "deduction-gate.md",
    [
      `# 青色申告特別控除ゲート — ${gate.calendar_year}年分`,
      "",
      `| 項目 | 内容 |`,
      `|------|------|`,
      `| 出典 | [国税庁 No.2072 青色申告特別控除](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm) |`,
      `| 関連 | [青色申告決算書](./aoiro-kessansho.md) · [確定申告書B](./kakutei-shinkoku-b.md) · [handoff](./handoff.md) |`,
      "",
      "## 判定結果",
      "",
      "| 項目 | 金額（円） |",
      "|------|----------:|",
      `| 事業所得（控除前） | ${yen(gate.business_income_yen)} |`,
      `| 適用上限（cap） | ${yen(gate.eligible_cap_yen)} |`,
      `| **適用額** | **${yen(gate.applied_deduction_yen)}** |`,
      "",
      "## 要件チェック",
      "",
      "| 要件 | 判定 |",
      "|------|------|",
      `| 複式簿記（正規の簿記） | ${yesNo(gate.double_entry)} |`,
      `| 個人事業主エンティティ | ${yesNo(gate.entity_ok)} |`,
      `| 帳簿パック準備 | ${yesNo(gate.books_ready)} |`,
      `| 貸借対照表あり | ${yesNo(gate.has_balance_sheet)} |`,
      `| 損益計算書あり | ${yesNo(gate.has_profit_loss)} |`,
      `| e-Tax 証跡 | ${yesNo(gate.etax_evidence)} |`,
      `| 優良電子帳簿証跡 | ${yesNo(gate.denshi_yuryo_evidence)} |`,
      `| 申告年不一致 | ${yesNo(gate.year_mismatch)} |`,
      "",
      "## 所見",
      "",
      ...gate.notes.map((n) => `- ${n}`),
      "",
      gate.future_note,
    ].join("\n"),
  );
  return { path, gate };
}

export function writeHandoffChecklist(calendarYear?: number): { path: string } {
  const ctx = resolveBlueReturnYear(calendarYear);
  const gate = writeDeductionGateReport(ctx.calendar_year).gate;
  const kessan = buildBlueReturnKessan(ctx.calendar_year);
  const y = ctx.calendar_year;
  let consumptionRow =
    "| 消費税 | — | tax-profile 未読取 |";
  try {
    const draft = buildConsumptionTaxDraftReturn({ calendarYear: y });
    const label = draft.exempt ? "申告不要（免税）" : "課税ドラフト要確認";
    consumptionRow = `| 消費税 | [${label}](../../tax/consumption/${y}/consumption-tax-draft-return.md) | ${draft.status} |`;
  } catch {
    consumptionRow = "| 消費税 | — | 集計不可（モジュール/プロファイル確認） |";
  }
  const moduleWarns = assessEntityModuleMismatches();
  const setupWarns = collectSetupGateWarnings(y);
  const path = writeBlueDoc(
    y,
    "handoff.md",
    [
      `# 税理士引き渡しチェックリスト — ${ctx.year_label}`,
      "",
      "| 項目 | 内容 |",
      "|------|------|",
      `| 対象年 | ${ctx.year_label}（${ctx.period_from} 〜 ${ctx.period_to}） |`,
      "| 提出 | **人間 / 税理士**（OrgOS は e-Tax を送信しない） |",
      "| 提出期限の目安 | 翌年 3月15日 |",
      `| 税務報告書インデックス | [tax-report-index.md](../../statements/${y}/tax-report-index.md) |`,
      "",
      "## 目次",
      "",
      "- [引き渡し一覧](#引き渡し一覧)",
      "- [家事按分](#家事按分)",
      "- [留意事項](#留意事項)",
      "",
      "## 引き渡し一覧",
      "",
      "| 書類 | リンク | 状態 |",
      "|------|--------|------|",
      `| 仕訳帳 | [shiwakecho.md](./shiwakecho.md) | 確認 |`,
      `| 総勘定元帳 | [sokanjomotocho.md](./sokanjomotocho.md) | 確認 |`,
      `| 試算表 | [shisanhyo.md](./shisanhyo.md) | 確認 |`,
      `| 青色申告決算書 | [aoiro-kessansho.md](./aoiro-kessansho.md) | ドラフト |`,
      `| 確定申告書B | [kakutei-shinkoku-b.md](./kakutei-shinkoku-b.md) | ドラフト |`,
      `| 青色特別控除 | [deduction-gate.md](./deduction-gate.md) | cap ${yen(gate.eligible_cap_yen)} · 適用 ${yen(gate.applied_deduction_yen)} |`,
      `| 損益計算書（GL） | [pl.md](../../statements/${y}/pl.md) | 参照 |`,
      `| 貸借対照表（GL） | [bs.md](../../statements/${y}/bs.md) | 参照 |`,
      `| 家事按分（事業分経費） | — | ${yen(kessan.expenses_yen)} 円（総額 ${yen(kessan.expenses_gross_yen)}） |`,
      consumptionRow,
      `| 支払調書 | [payment-slips-draft.md](../../tax/withholding/${y}/payment-slips-draft.md) | ドラフト |`,
      "| e-Tax 送信 | — | **人間 / 税理士**（OrgOS 範囲外） |",
      "",
      "> 65万円控除には期限内 e-Tax または優良電子帳簿届出が必要。[国税庁 No.2072](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm)",
      "",
      "## 家事按分",
      "",
      "- 設定ファイル: `data/finance/blue-return-allocation.yaml`",
      "- 家事分は **事業主貸** での記帳を推奨（本モジュールは自動振替しない）",
      "- 仕訳が既に事業分のみのときは `business_pct: 100`（二重控除防止）",
      ...kessan.allocation.notes.map((n) => `- ${n}`),
      "",
      "## 留意事項",
      "",
      "### 消費税",
      "",
      `- 年次ドラフト: [consumption-tax-draft-return.md](../../tax/consumption/${y}/consumption-tax-draft-return.md)`,
      "- 課税事業者は売上仕訳に `tax_category` を付与すること",
      "",
      ...(moduleWarns.length
        ? ["### モジュール整合", "", ...moduleWarns.map((w) => `- ${w}`), ""]
        : []),
      "### 初期セットアップ / 支出 intake",
      "",
      ...(setupWarns.length
        ? setupWarns.map((line) => `- ${line}`)
        : ["- setup ready · 未完了 intake なし"]),
      "",
      "再生成例:",
      "",
      "```bash",
      `orgos operations sole-prop-blue handoff --year ${y}`,
      `orgos operations tax-consumption draft-return --year ${y}`,
      "```",
    ].join("\n"),
  );
  writeTaxReportIndex(y, { kessan, gate });
  return { path };
}

/** 税務報告書のハブ（相対リンク付き）。handoff から呼び出す。 */
export function writeTaxReportIndex(
  calendarYear: number,
  input?: {
    kessan?: BlueReturnKessan;
    gate?: BlueReturnDeductionGate;
  },
): { path: string } {
  const y = calendarYear;
  const kessan = input?.kessan ?? buildBlueReturnKessan(y);
  const gate = input?.gate ?? writeDeductionGateReport(y).gate;
  const cfg = loadTenantConfig();
  let consumptionNet = "—";
  let consumptionStatus = "—";
  try {
    const draft = buildConsumptionTaxDraftReturn({ calendarYear: y });
    consumptionStatus = draft.status;
    consumptionNet =
      draft.summary != null
        ? `${yen(draft.summary.net_tax_yen)}（${
            draft.summary.direction === "payable" ? "納付" : draft.summary.direction === "refund" ? "還付" : draft.summary.direction
          }）`
        : draft.exempt
          ? "申告不要"
          : "—";
  } catch {
    /* optional */
  }
  const dir = join(getDocsDir(), "finance", "statements", String(y));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "tax-report-index.md");
  writeTrackedFile(
    path,
    [
      `# ${y}年分 税務報告書パック`,
      "",
      "| 項目 | 内容 |",
      "|------|------|",
      `| 屋号 / 氏名 | ${cfg.name} |`,
      `| 期間 | ${kessan.period_from} 〜 ${kessan.period_to} |`,
      "| 位置づけ | 税理士転記用ドラフト（提出・e-Tax 送信は人間） |",
      "",
      "## 目次",
      "",
      "- [サマリ](#サマリ)",
      "- [書類一覧](#書類一覧)",
      "- [留意事項](#留意事項)",
      "",
      "## サマリ",
      "",
      "| 項目 | 金額（円） |",
      "|------|----------:|",
      `| 売上（収入） | ${yen(kessan.revenue_yen)} |`,
      `| 経費計（事業分） | ${yen(kessan.expenses_yen)} |`,
      `| 所得（青色控除前） | ${yen(kessan.income_before_blue_deduction_yen)} |`,
      `| 青色申告特別控除 | ${yen(kessan.blue_deduction_yen)} |`,
      `| 事業所得（控除後） | ${yen(kessan.business_income_yen)} |`,
      `| 控除上限（cap） | ${yen(gate.eligible_cap_yen)} |`,
      `| 消費税（${consumptionStatus}） | ${consumptionNet} |`,
      "",
      "## 書類一覧",
      "",
      "| 区分 | 書類 | リンク |",
      "|------|------|--------|",
      `| 財務諸表 | 損益計算書 | [pl.md](./pl.md) |`,
      `| 財務諸表 | 貸借対照表 | [bs.md](./bs.md) |`,
      `| 所得税 | 青色申告決算書 | [aoiro-kessansho.md](../../blue-return/${y}/aoiro-kessansho.md) |`,
      `| 所得税 | 確定申告書B | [kakutei-shinkoku-b.md](../../blue-return/${y}/kakutei-shinkoku-b.md) |`,
      `| 所得税 | 青色特別控除ゲート | [deduction-gate.md](../../blue-return/${y}/deduction-gate.md) |`,
      `| 所得税 | 税理士引き渡し | [handoff.md](../../blue-return/${y}/handoff.md) |`,
      `| 帳簿 | 複式帳簿パック | [00-README.md](../../blue-return/${y}/00-README.md) |`,
      `| 消費税 | 申告金額ドラフト | [consumption-tax-draft-return.md](../../tax/consumption/${y}/consumption-tax-draft-return.md) |`,
      `| 源泉 | 支払調書ドラフト | [payment-slips-draft.md](../../tax/withholding/${y}/payment-slips-draft.md) |`,
      "",
      "## 留意事項",
      "",
      "- 空月・未ロック月は setup の acknowledge を前提とする（デモは年初仕訳が中心）",
      "- 消費税の期末振替 JE が無い場合は仮受/仮払残高が残る",
      "- e-Tax XML / 行政提出ファイルは生成しない",
      "",
      "出典: [国税庁 No.2072](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm)",
      "",
    ].join("\n"),
  );
  return { path };
}

/** Ensure optional filing YAML exists for sole-prop tenants. */
export function ensureBlueReturnFilingSkeleton(calendarYear: number): void {
  const path = join(getDataDir(), "finance", "blue-return-filing.yaml");
  if (existsSync(path)) return;
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeFileSync(
    path,
    YAML.stringify({
      version: 1,
      calendar_year: calendarYear,
      notes: "65万円には etax_submitted_at または denshi_yuryo_notified_at を記入",
    }),
    "utf-8",
  );
}
