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
import { getInstallRoot } from "../orgos-paths.js";
import { readYamlFile } from "../utils.js";
import { loadTaxProfile } from "../data.js";
import { buildConsumptionTaxSummary, resolveConsumptionTaxMethod } from "./consumption-tax.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";

const MAPPING_RELATIVE =
  "steward/jurisdiction-packs/JP/modules/jp_tax_consumption/spec/return-form-mapping.yaml";

export type ConsumptionTaxReturnBases = Partial<Record<ConsumptionTaxReturnInputKey, number>>;

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
  const bases: Record<ConsumptionTaxReturnInputKey, number> = {
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
  const rows = orderedRows(mapping.rows).map((row) =>
    projectRow(row, bases, method, filled, blockers)
  );
  const status = rows.some((row) => row.required && row.row_status !== "filled")
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
    rows,
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
  const summaries = months.map((period) =>
    buildConsumptionTaxSummary({ period, method: "standard" })
  );
  const summed = sumConsumptionTaxReturnBases(summaries);
  return projectConsumptionTaxReturnRows({
    fiscalYear: normalized,
    method: summed.method,
    bases: summed.bases,
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
  bases: Record<ConsumptionTaxReturnInputKey, number>,
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
  method: ConsumptionTaxReturnMethod,
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
  if (row.source.kind === "input") return oneInput(bases[row.source.key]);
  const ids = dependencyIds(row);
  const amounts: number[] = [];
  for (const id of ids) {
    const amount = filled.get(id);
    if (amount === undefined || amount === null) return null;
    amounts.push(amount);
  }
  return amounts;
}

function oneInput(amount: number | undefined): number[] | null {
  if (amount === undefined || !Number.isInteger(amount) || amount < 0) return null;
  return [amount];
}

function applyTransform(row: ConsumptionTaxReturnMapRow, values: number[]): number {
  const transform = row.transform;
  const first = values[0] ?? 0;
  if (transform.op === "identity") return first;
  if (transform.op === "floor_unit") return floorTo(first, transform.unit_yen);
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
