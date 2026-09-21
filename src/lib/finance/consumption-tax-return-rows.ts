import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConsumptionTaxSummary } from "../../../schemas/finance/consumption-tax.js";
import {
  consumptionTaxReturnMapSchema,
  consumptionTaxReturnRowsSchema,
  type ConsumptionTaxReturnInputKey,
  type ConsumptionTaxReturnMap,
  type ConsumptionTaxReturnMapRow,
  type ConsumptionTaxReturnRows,
} from "../../../schemas/finance/consumption-tax-return-map.js";
import {
  journalEntrySchema,
  normalizeJournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts, loadTaxProfile } from "../data.js";
import { getInstallRoot } from "../orgos-paths.js";
import { readYamlFile } from "../utils.js";
import { resolveConsumptionTaxMethod } from "./consumption-tax.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";

const MAPPING_RELATIVE =
  "steward/jurisdiction-packs/JP/modules/jp_tax_consumption/spec/return-form-mapping.yaml";

/** Explicit 該当なし is zero. A missing adjustment fact is not. */
export type ConsumptionTaxReturnFact = number | "該当なし";

export type ConsumptionTaxReturnBases = Partial<
  Record<ConsumptionTaxReturnInputKey, ConsumptionTaxReturnFact>
>;

export type ConsumptionTaxPurchaseLine = {
  occurred_on: string;
  tax_category: "taxable_10" | "taxable_8";
  base_yen: number;
  invoice_status?:
    | "qualified"
    | "nonqualified_80"
    | "nonqualified_70"
    | "nonqualified_50"
    | "exempt_supplier"
    | "unknown";
  purchase_use?: "taxable_only" | "common" | "non_taxable_only";
};

/** Ratio is taxable_yen / total_yen. Cap is tax-exclusive taxable sales, not the floored base. */
export type ConsumptionTaxPurchaseContext = {
  lines: ConsumptionTaxPurchaseLine[];
  ratio?: { taxable_yen: number; total_yen: number };
  taxable_sales_yen?: number;
};

export type ConsumptionTaxReturnMethod = "standard" | "simplified" | "unavailable";

type SummarySlice = {
  method: ConsumptionTaxSummary["method"];
  lines: Array<{
    tax_category: string;
    base_yen: number;
    direction: "sales" | "purchase";
  }>;
};

export function consumptionTaxReturnMappingPath(): string {
  const besideSource = join(dirname(fileURLToPath(import.meta.url)), "../../..", MAPPING_RELATIVE);
  if (existsSync(besideSource)) return besideSource;
  return join(getInstallRoot(), MAPPING_RELATIVE);
}

export function loadConsumptionTaxReturnMap(): ConsumptionTaxReturnMap {
  return readYamlFile(consumptionTaxReturnMappingPath(), consumptionTaxReturnMapSchema);
}

export function fiscalYearMonths(fiscalYear: string, fiscalYearEndMonth: number): string[] {
  const start = fiscalYearStartMonth(fiscalYear, fiscalYearEndMonth);
  const end = fiscalYearEndDate(fiscalYear, fiscalYearEndMonth).slice(0, 7);
  const months: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  for (let guard = 0; guard < 24; guard += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push(key);
    if (key === end) return months;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  throw new Error(`fiscal year ${fiscalYear} did not end at ${end}`);
}

export function normalizeConsumptionTaxFiscalYear(fiscalYear: string): string {
  const trimmed = fiscalYear.trim().toUpperCase();
  if (/^FY\d{4}$/.test(trimmed)) return trimmed;
  if (/^\d{4}$/.test(trimmed)) return `FY${trimmed}`;
  throw new Error("fiscal year must be YYYY or FYyyyy");
}

export function sumConsumptionTaxReturnBases(summaries: SummarySlice[]): {
  method: ConsumptionTaxReturnMethod;
  bases: ConsumptionTaxReturnBases;
} {
  if (summaries.some((summary) => summary.method !== "standard")) {
    return { method: "simplified", bases: {} };
  }
  const bases = {
    taxable_sales_10_yen: 0,
    taxable_sales_8_yen: 0,
    taxable_purchases_10_yen: 0,
    taxable_purchases_8_yen: 0,
  };
  for (const summary of summaries) {
    addSummaryBases(bases, summary);
  }
  return { method: "standard", bases };
}

export function projectConsumptionTaxReturnRows(input: {
  bases?: ConsumptionTaxReturnBases;
  purchases?: ConsumptionTaxPurchaseContext;
  method?: ConsumptionTaxReturnMethod;
  mapping?: ConsumptionTaxReturnMap;
  fiscalYear?: string;
  blockers?: string[];
}): ConsumptionTaxReturnRows {
  const mapping = input.mapping ?? loadConsumptionTaxReturnMap();
  const bases = input.bases ?? {};
  const method = input.method ?? "standard";
  const filled = new Map<string, number | null>();
  const blockers = [...(input.blockers ?? [])];
  if (method !== "standard") blockers.push("standard method required");
  const projected = orderedRows(mapping.rows).map((row) =>
    projectRow(row, bases, input.purchases, method, mapping, filled, blockers)
  );
  const status = projected.some((row) => row.required && row.row_status !== "filled")
    ? "blocked"
    : "ready_for_advisor_review";
  return consumptionTaxReturnRowsSchema.parse({
    submission: mapping.submission,
    status,
    fiscal_year: input.fiscalYear,
    form: mapping.form,
    source_label: mapping.source_label,
    disclaimer: mapping.disclaimer,
    blockers,
    rows: projected.filter((row) => row.sheet !== "internal"),
  });
}

export function buildFiscalYearConsumptionTaxReturnRows(
  fiscalYear: string
): ConsumptionTaxReturnRows {
  const normalized = normalizeConsumptionTaxFiscalYear(fiscalYear);
  const method = readFilingMethod();
  if (method.method !== "standard") {
    return projectConsumptionTaxReturnRows({
      fiscalYear: normalized,
      method: method.method,
      bases: {},
      blockers: method.blocker ? [method.blocker] : [],
    });
  }
  const months = fiscalYearMonths(normalized, resolveCompanyFiscalYearEndMonth());
  const facts = collectReturnFacts(loadJournalEntries().entries, new Set(months));
  return projectConsumptionTaxReturnRows({
    fiscalYear: normalized,
    method: "standard",
    bases: facts.bases,
    purchases: facts.purchases,
  });
}

export function formatConsumptionTaxReturnRows(result: ConsumptionTaxReturnRows): string {
  const header = result.fiscal_year
    ? `# 消費税申告書の行 ${result.fiscal_year}`
    : "# 消費税申告書の行";
  const lines = [
    header,
    "",
    result.disclaimer,
    "",
    `- status: ${result.status}`,
    `- submission: ${result.submission}`,
    "",
    "| 帳票 | 行 | 内容 | 金額 |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of result.rows) {
    lines.push(
      `| ${row.sheet} | ${row.line} | ${row.label_ja} | ${amountCell(row.row_status, row.amount_yen)} |`
    );
  }
  return lines.join("\n");
}

function addSummaryBases(
  bases: {
    taxable_sales_10_yen: number;
    taxable_sales_8_yen: number;
    taxable_purchases_10_yen: number;
    taxable_purchases_8_yen: number;
  },
  summary: SummarySlice
): void {
  for (const line of summary.lines) {
    const key = baseKey(line.direction, line.tax_category);
    if (!key) continue;
    bases[key] += line.base_yen;
  }
}

function baseKey(
  direction: "sales" | "purchase",
  taxCategory: string
): ConsumptionTaxReturnInputKey | undefined {
  if (direction === "sales" && taxCategory === "taxable_10") return "taxable_sales_10_yen";
  if (direction === "sales" && taxCategory === "taxable_8") return "taxable_sales_8_yen";
  if (direction === "purchase" && taxCategory === "taxable_10") return "taxable_purchases_10_yen";
  if (direction === "purchase" && taxCategory === "taxable_8") return "taxable_purchases_8_yen";
  return undefined;
}

function readFilingMethod(): { method: ConsumptionTaxReturnMethod; blocker?: string } {
  try {
    return { method: resolveConsumptionTaxMethod(loadTaxProfile()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tax profile unreadable";
    return { method: "unavailable", blocker: message };
  }
}

function dependencyIds(row: ConsumptionTaxReturnMapRow): string[] {
  if (row.source.kind === "row") return [row.source.id];
  if (row.source.kind === "rows") return row.source.ids;
  return [];
}

function orderedRows(rows: ConsumptionTaxReturnMapRow[]): ConsumptionTaxReturnMapRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pending = new Set(rows.map((row) => row.id));
  const ordered: ConsumptionTaxReturnMapRow[] = [];
  while (pending.size > 0) {
    const ready = [...pending].filter((id) =>
      dependencyIds(byId.get(id)!).every((dep) => !pending.has(dep))
    );
    if (ready.length === 0) {
      throw new Error("consumption tax return mapping has a cycle");
    }
    for (const id of ready) {
      ordered.push(byId.get(id)!);
      pending.delete(id);
    }
  }
  return ordered;
}

function projectRow(
  row: ConsumptionTaxReturnMapRow,
  bases: ConsumptionTaxReturnBases,
  purchases: ConsumptionTaxPurchaseContext | undefined,
  method: ConsumptionTaxReturnMethod,
  mapping: ConsumptionTaxReturnMap,
  filled: Map<string, number | null>,
  blockers: string[]
): ConsumptionTaxReturnRows["rows"][number] {
  if (row.transform.op === "out_of_scope") {
    filled.set(row.id, null);
    return rowResult(row, "out_of_scope", null);
  }
  if (method !== "standard") {
    filled.set(row.id, null);
    return rowResult(row, "blocked", null);
  }
  if (row.transform.op === "purchase_credit") {
    const credit = purchaseCredit(mapping, bases, purchases);
    filled.set(row.id, credit.amount);
    if (credit.amount === null && row.required)
      blockers.push(credit.reason ?? `${row.id} is not filled`);
    return rowResult(row, credit.amount === null ? "blocked" : "filled", credit.amount);
  }
  const amounts = sourceAmounts(row, bases, filled);
  if (!amounts) {
    filled.set(row.id, null);
    if (row.required) blockers.push(`${row.id} is not filled`);
    return rowResult(row, "blocked", null);
  }
  const amount = applyTransform(row, amounts);
  filled.set(row.id, amount);
  return rowResult(row, "filled", amount);
}

function sourceAmounts(
  row: ConsumptionTaxReturnMapRow,
  bases: ConsumptionTaxReturnBases,
  filled: Map<string, number | null>
): number[] | null {
  if (row.source.kind === "input") return oneInput(row.source.key, bases[row.source.key]);
  const ids = dependencyIds(row);
  const amounts: number[] = [];
  for (const id of ids) {
    const amount = filled.get(id);
    if (amount === undefined || amount === null) return null;
    amounts.push(amount);
  }
  return amounts;
}

const ADJUSTMENT_INPUTS = new Set<ConsumptionTaxReturnInputKey>([
  "excess_adjustment_yen",
  "return_tax_yen",
  "bad_debt_yen",
  "interim_payment_yen",
]);

function oneInput(
  key: ConsumptionTaxReturnInputKey,
  amount: ConsumptionTaxReturnFact | undefined
): number[] | null {
  if (amount === "該当なし") return ADJUSTMENT_INPUTS.has(key) ? [0] : null;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return null;
  return [amount];
}

function applyTransform(row: ConsumptionTaxReturnMapRow, values: number[]): number {
  const transform = row.transform;
  const first = values[0] ?? 0;
  if (transform.op === "identity") return first;
  if (transform.op === "floor_unit") return floorTo(first, transform.unit_yen);
  if (transform.op === "inclusive_rollback_floor") return inclusiveRollbackFloor(first, transform);
  if (transform.op === "rate_floor") {
    return Math.floor((first * transform.numerator) / transform.denominator);
  }
  if (transform.op === "sum") return values.reduce((total, value) => total + value, 0);
  if (transform.op === "subtract") return first - (values[1] ?? 0);
  if (transform.op === "floor_if_nonnegative") {
    return first >= 0 ? floorTo(first, transform.unit_yen) : first;
  }
  if (transform.op === "signed_rate_then_payable_floor") {
    return signedRateThenPayableFloor(first, transform);
  }
  throw new Error(`row ${row.id} has no amount`);
}

function signedRateThenPayableFloor(
  value: number,
  transform: { numerator: number; denominator: number; payable_unit_yen: number }
): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.floor((Math.abs(value) * transform.numerator) / transform.denominator);
  const rated = sign * magnitude;
  return rated >= 0 ? floorTo(rated, transform.payable_unit_yen) : rated;
}

function inclusiveRollbackFloor(
  exclusive: number,
  transform: {
    inclusive_numerator: number;
    inclusive_denominator: number;
    rollback_numerator: number;
    rollback_denominator: number;
    unit_yen: number;
  }
): number {
  const rolled =
    (BigInt(exclusive) *
      BigInt(transform.inclusive_numerator) *
      BigInt(transform.rollback_numerator)) /
    (BigInt(transform.inclusive_denominator) * BigInt(transform.rollback_denominator));
  return floorTo(Number(rolled), transform.unit_yen);
}

function floorTo(value: number, unit: number): number {
  return Math.floor(value / unit) * unit;
}

function rowResult(
  row: ConsumptionTaxReturnMapRow,
  rowStatus: "filled" | "blocked" | "out_of_scope",
  amountYen: number | null
): ConsumptionTaxReturnRows["rows"][number] {
  return {
    id: row.id,
    sheet: row.sheet,
    line: row.line,
    label_ja: row.label_ja,
    required: row.required,
    row_status: rowStatus,
    amount_yen: amountYen,
  };
}

function amountCell(status: "filled" | "blocked" | "out_of_scope", amount: number | null): string {
  if (status === "out_of_scope") return "対象外";
  if (status === "blocked" || amount === null) return "未充足";
  return String(amount);
}

function purchaseCredit(
  mapping: ConsumptionTaxReturnMap,
  bases: ConsumptionTaxReturnBases,
  purchases: ConsumptionTaxPurchaseContext | undefined
): { amount: number | null; reason?: string } {
  const lines = purchases?.lines ?? [];
  if (!purchases) return { amount: null, reason: "purchase lines are missing" };
  if (lines.length === 0) return { amount: 0 };
  const salesYen = purchases.taxable_sales_yen ?? salesYenFromBases(bases);
  if (salesYen === null) return { amount: null, reason: "taxable sales cap is missing" };
  const ratio = purchases.ratio;
  if (
    !ratio ||
    !Number.isInteger(ratio.taxable_yen) ||
    !Number.isInteger(ratio.total_yen) ||
    ratio.total_yen <= 0
  ) {
    return { amount: null, reason: "taxable sales ratio is missing" };
  }
  let total = 0;
  for (const line of lines) {
    const lineCredit = onePurchaseCredit(mapping, line, salesYen, ratio);
    if (lineCredit === null) return { amount: null, reason: "purchase credit is blocked" };
    total += lineCredit;
  }
  return { amount: total };
}

function salesYenFromBases(bases: ConsumptionTaxReturnBases): number | null {
  const ten = bases.taxable_sales_10_yen;
  const eight = bases.taxable_sales_8_yen;
  if (!Number.isInteger(ten) || !Number.isInteger(eight) || ten! < 0 || eight! < 0) return null;
  return ten! + eight!;
}

function onePurchaseCredit(
  mapping: ConsumptionTaxReturnMap,
  line: ConsumptionTaxPurchaseLine,
  salesYen: number,
  ratio: { taxable_yen: number; total_yen: number }
): number | null {
  if (!Number.isInteger(line.base_yen) || line.base_yen < 0) return null;
  if (line.base_yen === 0) return 0;
  if (
    !line.invoice_status ||
    line.invoice_status === "unknown" ||
    line.invoice_status === "exempt_supplier"
  ) {
    return null;
  }
  if (line.purchase_use !== "taxable_only") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.occurred_on)) return null;
  const rate = mapping.national_rates[line.tax_category];
  const national = Math.floor((line.base_yen * rate.numerator) / rate.denominator);
  if (line.invoice_status === "qualified") {
    const rule = mapping.full_purchase_credit;
    const ratioOk = ratio.taxable_yen * 10000 >= ratio.total_yen * rule.min_ratio_bp;
    if (!ratioOk || salesYen > rule.max_taxable_sales_yen) return null;
    return national;
  }
  const band = mapping.transitional_nonqualified.find(
    (candidate) => line.occurred_on >= candidate.from && line.occurred_on <= candidate.through
  );
  if (!band || band.invoice_status !== line.invoice_status) return null;
  return Math.floor((national * band.numerator) / band.denominator);
}

function collectReturnFacts(
  entries: unknown[],
  months: Set<string>
): { bases: ConsumptionTaxReturnBases; purchases: ConsumptionTaxPurchaseContext } {
  const bases = {
    taxable_sales_10_yen: 0,
    taxable_sales_8_yen: 0,
    taxable_purchases_10_yen: 0,
    taxable_purchases_8_yen: 0,
  };
  let exemptSales = 0;
  let taxFreeSales = 0;
  const lines: ConsumptionTaxPurchaseLine[] = [];
  let coa: ReturnType<typeof loadChartOfAccounts>;
  try {
    coa = loadChartOfAccounts();
  } catch {
    return {
      bases,
      purchases: { lines, taxable_sales_yen: 0 },
    };
  }
  const accountByCode = new Map(coa.accounts.map((account) => [account.code, account]));
  for (const raw of entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    const month = entry.occurred_at.slice(0, 7);
    if (!months.has(month)) continue;
    for (const line of entry.lines) {
      if (!line.tax_category) continue;
      const account = accountByCode.get(line.account_code);
      if (!account || (account.type !== "revenue" && account.type !== "expense")) continue;
      const amount = line.debit_yen || line.credit_yen;
      if (account.type === "revenue" && line.tax_category === "taxable_10")
        bases.taxable_sales_10_yen += amount;
      if (account.type === "revenue" && line.tax_category === "taxable_8")
        bases.taxable_sales_8_yen += amount;
      if (account.type === "revenue" && line.tax_category === "exempt") exemptSales += amount;
      if (account.type === "revenue" && line.tax_category === "tax_free") taxFreeSales += amount;
      if (
        account.type === "expense" &&
        (line.tax_category === "taxable_10" || line.tax_category === "taxable_8")
      ) {
        const key =
          line.tax_category === "taxable_10"
            ? "taxable_purchases_10_yen"
            : "taxable_purchases_8_yen";
        bases[key] += amount;
        lines.push({
          occurred_on: entry.occurred_at.slice(0, 10),
          tax_category: line.tax_category,
          base_yen: amount,
          invoice_status: line.invoice_status,
          purchase_use: line.purchase_use,
        });
      }
    }
  }
  const taxable = bases.taxable_sales_10_yen + bases.taxable_sales_8_yen;
  const numerator = taxable + taxFreeSales;
  const denominator = numerator + exemptSales;
  return {
    bases,
    purchases: {
      lines,
      taxable_sales_yen: taxable,
      ratio: denominator > 0 ? { taxable_yen: numerator, total_yen: denominator } : undefined,
    },
  };
}
