import { loadChartOfAccounts } from "../../../../../../src/lib/data.js";
import type {
  CashflowExportTemplate,
  CashflowScheduleRow,
  PaymentCalendarEntry,
} from "../../../../../../schemas/jp-bank-corporate.js";
import { buildCalendarImport } from "./calendar-import.js";
import { buildCashflowSchedule } from "./cashflow-builder.js";
import { resolveChartAccountId } from "./chart-account.js";
import {
  loadCashflowExportTemplate,
  loadPaymentCalendar,
} from "./data-loaders.js";

type ExportValue = string | number | null | undefined;
type ExportRecord = Record<string, ExportValue>;

export interface CashflowExportResult {
  template: CashflowExportTemplate;
  template_path: string;
  csv: string;
  row_count: number;
  warnings: string[];
}

export function escapeCsvValue(value: ExportValue, delimiter = ","): string {
  const text = value == null ? "" : String(value);
  if (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function renderTemplateCsv(
  template: CashflowExportTemplate,
  records: ExportRecord[]
): string {
  const header = template.columns
    .map((column) => escapeCsvValue(column.header, template.delimiter))
    .join(template.delimiter);
  const body = records.map((record) =>
    template.columns
      .map((column) => {
        if (column.when && record.direction !== column.when) return "";
        return escapeCsvValue(record[column.key], template.delimiter);
      })
      .join(template.delimiter)
  );
  return [header, ...body].join("\n");
}

function scheduleRecord(row: CashflowScheduleRow): ExportRecord {
  return {
    period_key: row.period_key,
    period_start: row.period_start,
    period_end: row.period_end,
    date: row.period_start,
    direction: row.direction,
    category: row.category,
    description: row.description,
    planned_amount: row.planned_amount,
    actual_amount: row.actual_amount,
    forecast_amount: row.forecast_amount,
    balance_total: row.balance_total,
    account_id: row.account_id,
    bank_account_id: row.account_id,
    chart_account_id: row.chart_account_id,
    source: row.source,
    line_id: row.line_id,
    inflow_amount: row.direction === "inflow" ? row.planned_amount : "",
    outflow_amount: row.direction === "outflow" ? row.planned_amount : "",
    amount:
      row.actual_amount ??
      (row.planned_amount !== 0 ? row.planned_amount : row.forecast_amount),
  };
}

function weekBounds(date: string): { start: string; end: string } {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  const end = new Date(value);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    start: value.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function mizuhoWeeklyRecords(rows: CashflowScheduleRow[]): ExportRecord[] {
  const grouped = new Map<string, ExportRecord>();
  for (const row of rows) {
    const week = weekBounds(row.period_start);
    const key = [
      week.start,
      row.direction,
      row.account_id ?? "",
      row.chart_account_id ?? "",
      row.category,
    ].join("|");
    const existing = grouped.get(key);
    const amount =
      row.actual_amount ??
      (row.planned_amount !== 0 ? row.planned_amount : row.forecast_amount ?? 0);
    if (existing) {
      existing.amount = Number(existing.amount ?? 0) + amount;
      existing.balance_total = row.balance_total;
      continue;
    }
    grouped.set(key, {
      week_start: week.start,
      week_end: week.end,
      direction: row.direction,
      category: row.category,
      description: `${row.category} 週次集約`,
      chart_account_id: row.chart_account_id,
      bank_account_id: row.account_id,
      amount,
      balance_total: row.balance_total,
      source: "aggregate",
    });
  }
  return [...grouped.values()];
}

function isTaxEntry(entry: PaymentCalendarEntry): boolean {
  return entry.amount > 0 && (entry.source === "tax-calendar" || /税/.test(entry.category));
}

function taxPaymentRecords(): { records: ExportRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const explicit = (loadPaymentCalendar()?.data.entries ?? []).filter(isTaxEntry);
  let imported: PaymentCalendarEntry[] = [];
  try {
    const result = buildCalendarImport({ from: "tax" });
    imported = result.entries.filter(isTaxEntry);
    warnings.push(...result.warnings);
  } catch (error) {
    warnings.push(
      `tax profile is not available: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const unique = new Map<string, PaymentCalendarEntry>();
  for (const entry of [...explicit, ...imported]) {
    const key = `${entry.date}|${entry.amount}`;
    if (!unique.has(key)) unique.set(key, entry);
  }

  let chart: ReturnType<typeof loadChartOfAccounts> | undefined;
  try {
    chart = loadChartOfAccounts();
  } catch (error) {
    warnings.push(
      `chart of accounts is not available: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const records = [...unique.values()].map((entry) => {
    const resolved = chart
      ? resolveChartAccountId(
          {
            category: entry.category,
            direction: entry.direction,
            chart_account_id: entry.chart_account_id,
          },
          chart
        )
      : {};
    if (resolved.warning) warnings.push(`${entry.id}: ${resolved.warning}`);
    return {
      date: entry.date,
      direction: entry.direction,
      tax_id: entry.id,
      tax_name: entry.category,
      category: entry.category,
      description: entry.description,
      amount: entry.amount,
      chart_account_id: resolved.chart_account_id,
      bank_account_id: entry.account_id,
      source: entry.source,
    };
  });
  return { records, warnings };
}

export function generateCashflowExport(templateId: string): CashflowExportResult {
  const loaded = loadCashflowExportTemplate(templateId);
  let records: ExportRecord[];
  let warnings: string[] = [];
  if (loaded.data.source === "tax-payments") {
    const tax = taxPaymentRecords();
    records = tax.records;
    warnings = tax.warnings;
  } else {
    const schedule = buildCashflowSchedule({
      granularity: "daily",
      horizon: "3m",
    });
    warnings = schedule.warnings;
    records =
      loaded.data.source === "mizuho-weekly"
        ? mizuhoWeeklyRecords(schedule.rows)
        : schedule.rows.map(scheduleRecord);
  }
  return {
    template: loaded.data,
    template_path: loaded.path,
    csv: renderTemplateCsv(loaded.data, records),
    row_count: records.length,
    warnings,
  };
}
