import {
  loadAllData,
  loadCashBalance,
  loadChartOfAccounts,
  loadDebtPlan,
  loadPayroll,
  loadTaxProfile,
  loadYojitsuFyPlan,
  resolveCashBalanceTotal,
} from "../../../../../../src/lib/data.js";
import { generateForecast } from "../../../../../../src/lib/forecast.js";
import {
  currentDate,
  currentMonth,
  addMonths,
  formatCurrency,
} from "../../../../../../src/lib/utils.js";
import type {
  CashflowGranularity,
  CashflowSchedule,
  CashflowScheduleRow,
  PaymentCalendarEntry,
} from "../../../../../../schemas/jp-bank-corporate.js";
import type { ChartOfAccounts } from "../../../../../../schemas/finance/types.js";
import { loadArApLedger, loadCollectionTerms, loadPaymentCalendar } from "./data-loaders.js";
import { resolveDefaultAccountId } from "./calendar-import.js";
import { resolveChartAccountId } from "./chart-account.js";

export interface RawLineItem {
  line_id: string;
  date: string;
  direction: "inflow" | "outflow" | "transfer";
  category: string;
  chart_account_data_source?: string;
  description: string;
  amount: number;
  account_id?: string;
  counterparty_account_id?: string;
  chart_account_id?: string;
  source: CashflowScheduleRow["source"];
  planned_amount: number;
  actual_amount: number | null;
  forecast_amount: number | null;
  origin?: CashflowLineOrigin;
}

export type CashflowLineOrigin =
  | "payment-calendar"
  | "ar-ap"
  | "payroll-auto"
  | "tax-auto"
  | "capex-auto"
  | "fixed-cost-auto"
  | "monthly-forecast"
  | "debt-auto"
  | "other";

export interface CashflowBuilderOptions {
  granularity: CashflowGranularity;
  horizonStart?: string;
  horizon?: string;
  horizonEnd?: string;
  asOf?: string;
}

export function resolveRawLineChartAccounts(
  items: RawLineItem[],
  chart: ChartOfAccounts
): { items: RawLineItem[]; warnings: string[] } {
  const warnings: string[] = [];
  return {
    items: items.map((item) => {
      const resolved = resolveChartAccountId(
        {
          category: item.category,
          direction: item.direction,
          chart_account_id: item.chart_account_id,
          data_source: item.chart_account_data_source,
        },
        chart
      );
      if (resolved.warning) warnings.push(`${item.line_id}: ${resolved.warning}`);
      return { ...item, chart_account_id: resolved.chart_account_id };
    }),
    warnings,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseHorizonEnd(start: string, horizon: string): string {
  const m = horizon.trim().match(/^(\d+)([dwm])$/i);
  if (!m) throw new Error(`Invalid horizon "${horizon}" — use e.g. 13w, 90d, 3m`);
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "d") return addDays(start, n);
  if (unit === "w") return addDays(start, n * 7);
  const { year, month } = parseMonthDate(start);
  const end = new Date(year, month - 1 + n, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

function parseMonthDate(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function fixedCostCategory(name: string): string {
  return name.split(/[（(]/, 1)[0].trim();
}

function isoWeekKey(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekBounds(iso: string): { start: string; end: string; key: string } {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday), key: isoWeekKey(iso) };
}

function periodForDate(date: string, granularity: CashflowGranularity): {
  period_key: string;
  period_start: string;
  period_end: string;
} {
  if (granularity === "daily") {
    return { period_key: date, period_start: date, period_end: date };
  }
  if (granularity === "weekly") {
    const w = weekBounds(date);
    return { period_key: w.key, period_start: w.start, period_end: w.end };
  }
  const month = date.slice(0, 7);
  return { period_key: month, period_start: monthStart(month), period_end: monthEnd(month) };
}

function signedAmount(direction: RawLineItem["direction"], amount: number): number {
  if (direction === "inflow") return amount;
  if (direction === "outflow") return -amount;
  return 0;
}

function inferOrigin(item: RawLineItem): CashflowLineOrigin {
  if (item.origin) return item.origin;
  if (item.line_id.startsWith("payroll-")) return "payroll-auto";
  if (item.line_id.startsWith("tax-")) return "tax-auto";
  if (item.line_id.startsWith("capex-")) return "capex-auto";
  if (item.line_id.startsWith("fixed-")) return "fixed-cost-auto";
  if (item.line_id.startsWith("forecast-")) return "monthly-forecast";
  if (item.line_id.startsWith("debt-")) return "debt-auto";
  if (item.source === "ar-ap") return "ar-ap";
  if (item.source === "payment-calendar") return "payment-calendar";
  return "other";
}

function sourcePriority(origin: CashflowLineOrigin): number {
  if (origin === "payment-calendar") return 300;
  if (origin === "ar-ap") return 200;
  if (origin === "monthly-forecast") return 0;
  if (origin.endsWith("-auto")) return 100;
  return 150;
}

type SemanticFamily = "payroll" | "tax" | "capex" | "fixed-cost" | "other";

function semanticFamily(item: RawLineItem): SemanticFamily {
  const origin = inferOrigin(item);
  if (origin === "payroll-auto") return "payroll";
  if (origin === "tax-auto") return "tax";
  if (origin === "capex-auto") return "capex";
  if (origin === "fixed-cost-auto") return "fixed-cost";
  const text = `${item.category} ${item.description}`;
  if (/給与|給料|賞与|賃金/.test(text)) return "payroll";
  if (/税|租税/.test(text)) return "tax";
  if (/設備投資|資本的支出|capex|固定資産.*取得/i.test(text)) return "capex";
  return "other";
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s・,，.。:：/／_-]+/g, "");
}

function sameAccount(left: RawLineItem, right: RawLineItem): boolean {
  return !left.account_id || !right.account_id || left.account_id === right.account_id;
}

function exactSemanticKey(item: RawLineItem): string {
  const family = semanticFamily(item);
  return [
    item.date,
    item.direction,
    item.amount,
    item.account_id ?? "",
    item.counterparty_account_id ?? "",
    family,
    family === "other" ? normalizedText(item.category) : family,
    normalizedText(item.description),
  ].join("|");
}

function fallbackMatchesAuthoritative(
  fallback: RawLineItem,
  authoritative: RawLineItem
): boolean {
  if (
    fallback.date.slice(0, 7) !== authoritative.date.slice(0, 7) ||
    fallback.direction !== authoritative.direction ||
    !sameAccount(fallback, authoritative)
  ) {
    return false;
  }
  const family = semanticFamily(fallback);
  if (family !== "fixed-cost") return family === semanticFamily(authoritative);
  if (fallback.amount !== authoritative.amount) return false;

  const fallbackText = normalizedText(`${fallback.category}${fallback.description}`);
  const authoritativeText = normalizedText(
    `${authoritative.category}${authoritative.description}`
  );
  return (
    (fallback.chart_account_id != null &&
      fallback.chart_account_id === authoritative.chart_account_id) ||
    fallbackText.includes(authoritativeText) ||
    authoritativeText.includes(normalizedText(fallback.description))
  );
}

/**
 * Resolves cross-source duplicates without collapsing distinct entries from the
 * same source. Confirmed calendar/AR-AP lines win over generated fallbacks.
 */
export function resolveCashflowLineItems(items: RawLineItem[]): RawLineItem[] {
  const ranked = items
    .map((item, index) => ({ item, index, origin: inferOrigin(item) }))
    .sort(
      (a, b) =>
        sourcePriority(b.origin) - sourcePriority(a.origin) || a.index - b.index
    );
  const selected: Array<{ item: RawLineItem; origin: CashflowLineOrigin }> = [];

  for (const candidate of ranked) {
    const duplicate = selected.some(
      (existing) =>
        existing.origin !== candidate.origin &&
        exactSemanticKey(existing.item) === exactSemanticKey(candidate.item)
    );
    if (!duplicate) selected.push(candidate);
  }

  const authoritative = selected.filter(
    ({ origin }) => origin === "payment-calendar" || origin === "ar-ap"
  );
  const withoutFallbackDuplicates = selected.filter(({ item, origin }) => {
    if (
      !["payroll-auto", "tax-auto", "capex-auto", "fixed-cost-auto"].includes(
        origin
      )
    ) {
      return true;
    }
    return !authoritative.some(({ item: confirmed }) =>
      fallbackMatchesAuthoritative(item, confirmed)
    );
  });

  const detailedMonths = new Set(
    withoutFallbackDuplicates
      .filter(({ origin }) => origin !== "monthly-forecast")
      .map(({ item }) => item.date.slice(0, 7))
  );

  return withoutFallbackDuplicates
    .filter(
      ({ item, origin }) =>
        origin !== "monthly-forecast" || !detailedMonths.has(item.date.slice(0, 7))
    )
    .map(({ item }) => item)
    .sort((a, b) => a.date.localeCompare(b.date) || a.line_id.localeCompare(b.line_id));
}

/**
 * Converts detailed schedule rows into period/direction totals. Each aggregate
 * carries the period-closing balance calculated from the detailed rows.
 */
export function rollupCashflowRows(
  rows: CashflowScheduleRow[],
  granularity: CashflowGranularity
): CashflowScheduleRow[] {
  if (granularity === "daily") return rows;

  interface RollupBucket {
    period: ReturnType<typeof periodForDate>;
    direction: RawLineItem["direction"];
    planned: number;
    actual: number;
    forecast: number;
    hasActual: boolean;
    hasForecast: boolean;
    count: number;
    closingRow: CashflowScheduleRow;
  }

  const buckets = new Map<string, RollupBucket>();
  const periodClosings = new Map<string, CashflowScheduleRow>();
  for (const row of rows) {
    const period = periodForDate(row.period_start, granularity);
    periodClosings.set(period.period_key, row);
    const key = `${period.period_key}|${row.direction}`;
    const bucket = buckets.get(key) ?? {
      period,
      direction: row.direction,
      planned: 0,
      actual: 0,
      forecast: 0,
      hasActual: false,
      hasForecast: false,
      count: 0,
      closingRow: row,
    };
    bucket.planned += row.planned_amount;
    if (row.actual_amount != null) {
      bucket.actual += row.actual_amount;
      bucket.hasActual = true;
    }
    if (row.forecast_amount != null) {
      bucket.forecast += row.forecast_amount;
      bucket.hasForecast = true;
    }
    bucket.count += 1;
    bucket.closingRow = row;
    buckets.set(key, bucket);
  }

  const directionOrder: Record<RawLineItem["direction"], number> = {
    inflow: 0,
    outflow: 1,
    transfer: 2,
  };
  return [...buckets.values()]
    .sort(
      (a, b) =>
        a.period.period_start.localeCompare(b.period.period_start) ||
        directionOrder[a.direction] - directionOrder[b.direction]
    )
    .map((bucket) => {
      const closing = periodClosings.get(bucket.period.period_key) ?? bucket.closingRow;
      const label =
        bucket.direction === "inflow"
          ? "入金"
          : bucket.direction === "outflow"
            ? "出金"
            : "振替";
      return {
        period_key: bucket.period.period_key,
        period_start: bucket.period.period_start,
        period_end: bucket.period.period_end,
        direction: bucket.direction,
        category: `期間${label}計`,
        description: `${bucket.count}件の${label}明細`,
        planned_amount: bucket.planned,
        actual_amount: bucket.hasActual ? bucket.actual : null,
        forecast_amount: bucket.hasForecast ? bucket.forecast : null,
        balance_total: closing.balance_total,
        balance_by_account: { ...closing.balance_by_account },
        source: "aggregate",
        line_id: `rollup-${bucket.period.period_key}-${bucket.direction}`,
      };
    });
}

function calendarEntryToLine(entry: PaymentCalendarEntry): RawLineItem {
  return {
    line_id: entry.id,
    date: entry.date,
    direction: entry.direction,
    category: entry.category,
    description: entry.description,
    amount: entry.amount,
    account_id: entry.account_id,
    counterparty_account_id: entry.counterparty_account_id,
    chart_account_id: entry.chart_account_id,
    source: entry.source ?? "payment-calendar",
    planned_amount: entry.status === "planned" ? entry.amount : 0,
    actual_amount: entry.status === "paid" ? entry.amount : null,
    forecast_amount: null,
    origin: "payment-calendar",
  };
}

function fyEndDate(fiscalYear: string): string {
  const fy = fiscalYear.replace(/^FY/i, "");
  const year = parseInt(fy, 10);
  return `${year + 1}-01-31`;
}

export class CashflowScheduleBuilder {
  private options: Required<
    Pick<CashflowBuilderOptions, "granularity" | "horizonStart" | "horizonEnd" | "asOf">
  >;

  constructor(options: CashflowBuilderOptions) {
    const asOf = options.asOf ?? currentDate();
    const horizonStart = options.horizonStart ?? asOf;
    const horizonEnd =
      options.horizonEnd ??
      (options.horizon ? parseHorizonEnd(horizonStart, options.horizon) : addDays(horizonStart, 13 * 7));
    this.options = {
      granularity: options.granularity,
      horizonStart,
      horizonEnd,
      asOf,
    };
  }

  loadOpeningBalances(): {
    total: number;
    byAccount: Record<string, number>;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const balance = loadCashBalance();
    if (!balance) {
      warnings.push("cash-balance.yaml missing — opening balance assumed 0");
      return { total: 0, byAccount: {}, warnings };
    }
    if (balance.status !== "confirmed") {
      warnings.push(`cash-balance status is "${balance.status}" — use confirmed for treasury`);
    }
    const byAccount: Record<string, number> = {};
    for (const acct of balance.accounts) {
      const id = acct.bank_account_id ?? acct.id;
      if (id && acct.amount != null) byAccount[id] = acct.amount;
    }
    const total = resolveCashBalanceTotal(balance) ?? Object.values(byAccount).reduce((s, v) => s + v, 0);
    return { total, byAccount, warnings };
  }

  buildRawLineItems(): RawLineItem[] {
    const items: RawLineItem[] = [];
    const { horizonStart, horizonEnd } = this.options;
    const defaultAccountId = resolveDefaultAccountId();

    const calendar = loadPaymentCalendar();
    for (const entry of calendar?.data.entries ?? []) {
      if (entry.status === "cancelled") continue;
      if (entry.date < horizonStart || entry.date > horizonEnd) continue;
      items.push(calendarEntryToLine(entry));
    }

    const arAp = loadArApLedger();
    const terms = loadCollectionTerms();
    const termById = new Map((terms?.data.rules ?? []).map((r) => [r.id, r]));

    for (const entry of arAp?.data.entries ?? []) {
      if (["collected", "paid", "cancelled"].includes(entry.status)) continue;
      const cashDate = entry.due_date;
      const term = entry.collection_term_id
        ? termById.get(entry.collection_term_id)
        : undefined;
      if (cashDate < horizonStart || cashDate > horizonEnd) continue;
      const direction = entry.kind === "ar" ? "inflow" : "outflow";
      items.push({
        line_id: entry.id,
        date: cashDate,
        direction,
        category: entry.category ?? (entry.kind === "ar" ? "売掛回収" : "買掛支払"),
        description: entry.description,
        amount: entry.amount,
        account_id: entry.account_id ?? term?.default_account_id ?? defaultAccountId,
        chart_account_id: entry.chart_account_id ?? term?.chart_account_id,
        source: "ar-ap",
        planned_amount: entry.status === "open" ? entry.amount : entry.amount * 0.5,
        actual_amount: entry.status === "partial" ? entry.amount * 0.5 : null,
        forecast_amount: null,
        origin: "ar-ap",
      });
    }

    const data = loadAllData();
    const startMonth = horizonStart.slice(0, 7);
    const endMonth = horizonEnd.slice(0, 7);
    let month = startMonth;
    const months: string[] = [];
    while (month <= endMonth) {
      months.push(month);
      month = addMonths(month, 1);
    }

    const forecast = generateForecast(
      data.monthlyFinances,
      data.fixedCosts,
      data.loans,
      data.propertyRevenuePlan,
      data.properties,
      { months: months.length, startMonth },
      {}
    );

    for (const f of forecast) {
      const date = monthEnd(f.month);
      if (date < horizonStart || date > horizonEnd) continue;
      if (f.netCashFlow === 0) continue;
      const direction = f.netCashFlow >= 0 ? "inflow" : "outflow";
      items.push({
        line_id: `forecast-${f.month}`,
        date,
        direction,
        category: f.source === "actual" ? "月次実績CF" : "月次予測CF",
        description: `${f.month} 純キャッシュフロー（${f.source === "actual" ? "実績" : "計画"}）`,
        amount: Math.abs(f.netCashFlow),
        account_id: defaultAccountId,
        source: f.source === "actual" ? "actual" : "forecast",
        planned_amount: f.source === "planned" ? Math.abs(f.netCashFlow) : 0,
        actual_amount: f.source === "actual" ? Math.abs(f.netCashFlow) : null,
        forecast_amount: f.source === "planned" ? Math.abs(f.netCashFlow) : null,
        origin: "monthly-forecast",
      });
    }

    const horizonYear = Number(horizonStart.slice(0, 4));
    const yojitsu = [`FY${horizonYear}`, `FY${horizonYear - 1}`]
      .map((fiscalYear) => loadYojitsuFyPlan(fiscalYear))
      .find((plan) =>
        plan?.months.some((row) => row.month >= startMonth && row.month <= endMonth)
      );
    if (yojitsu) {
      for (const row of yojitsu.months) {
        const capexFromLines = (side?: { lines?: Array<{ kind: string; amount: number }> }) =>
          (side?.lines ?? []).filter((l) => l.kind === "capex").reduce((s, l) => s + l.amount, 0);
        const legacyCapex =
          (row as { actual?: { capex?: number }; plan?: { capex?: number } }).actual?.capex ??
          (row as { plan?: { capex?: number } }).plan?.capex ??
          0;
        const capex = capexFromLines(row.actual) || capexFromLines(row.plan) || legacyCapex;
        if (!capex) continue;
        const date = `${row.month}-25`;
        if (date < horizonStart || date > horizonEnd) continue;
        items.push({
          line_id: `capex-${row.month}`,
          date,
          direction: "outflow",
          category: "設備投資",
          description: `設備投資（予実 ${row.month}）`,
          amount: capex,
          account_id: defaultAccountId,
          source: "planned",
          planned_amount: capex,
          actual_amount: capexFromLines(row.actual) ? capex : null,
          forecast_amount: null,
          origin: "capex-auto",
        });
      }
    }

    try {
      const debt = loadDebtPlan();
      const base = debt.scenarios.find((s) => s.id === "base");
      for (const rep of base?.repayments ?? []) {
        if (!rep.principal) continue;
        const date = fyEndDate(rep.fiscal_year);
        if (date < horizonStart || date > horizonEnd) continue;
        items.push({
          line_id: `debt-${rep.fiscal_year}-${rep.loan_id}`,
          date,
          direction: "outflow",
          category: "借入返済",
          description: `${rep.fiscal_year} ${rep.loan_id} 元本返済`,
          amount: rep.principal,
          account_id: defaultAccountId,
          source: "payment-calendar",
          planned_amount: rep.status === "planned" ? rep.principal : 0,
          actual_amount: rep.status === "confirmed" ? rep.principal : null,
          forecast_amount: null,
          origin: "debt-auto",
        });
      }
    } catch {
      // debt-plan optional
    }

    try {
      const tax = loadTaxProfile() as { filing_calendar?: Array<{ id: string; tax: string; deadline: string; status?: string }>; corporate_tax?: { estimated_tax_fy2026?: number } };
      const est = tax.corporate_tax?.estimated_tax_fy2026;
      for (const filing of tax.filing_calendar ?? []) {
        if (filing.status === "not_required") continue;
        if (filing.deadline < horizonStart || filing.deadline > horizonEnd) continue;
        const amount = filing.id === "hojinzei-kokuzei" ? est : undefined;
        if (!amount) continue;
        items.push({
          line_id: `tax-${filing.id}`,
          date: filing.deadline,
          direction: "outflow",
          category: "税金",
          description: filing.tax,
          amount,
          account_id: defaultAccountId,
          source: "tax-calendar",
          planned_amount: amount,
          actual_amount: null,
          forecast_amount: null,
          origin: "tax-auto",
        });
      }
    } catch {
      // tax-profile optional
    }

    try {
      const payroll = loadPayroll();
      const monthlyPersonnel =
        data.monthlyFinances
          .flatMap((m) => m.expenses.filter((e) => /給与|給料|賞与|賃金/.test(e.notes ?? "")))
          .map((e) => e.amount)
          .find((a) => a > 0) ?? 0;
      if (payroll.officers?.some((o) => (o.monthly ?? 0) > 0) || monthlyPersonnel > 0) {
        for (const m of months) {
          const date = `${m}-25`;
          if (date < horizonStart || date > horizonEnd) continue;
          const officerTotal =
            payroll.officers?.reduce((s, o) => s + (o.monthly ?? 0), 0) ?? 0;
          const amount = officerTotal || monthlyPersonnel;
          if (!amount) continue;
          items.push({
            line_id: `payroll-${m}`,
            date,
            direction: "outflow",
            category: "給与",
            chart_account_data_source: "payroll.yaml",
            description: `${m} 給与支払`,
            amount,
            account_id: defaultAccountId,
            source: "planned",
            planned_amount: amount,
            actual_amount: null,
            forecast_amount: null,
            origin: "payroll-auto",
          });
        }
      }
    } catch {
      // payroll optional
    }

    for (const fc of data.fixedCosts.items) {
      if (!fc.monthly_amount) continue;
      for (const m of months) {
        const date = `${m}-28`;
        if (date < horizonStart || date > horizonEnd) continue;
        items.push({
          line_id: `fixed-${fc.name}-${m}`,
          date,
          direction: "outflow",
          category: fixedCostCategory(fc.name),
          description: fc.name,
          amount: fc.monthly_amount,
          account_id: defaultAccountId,
          source: "planned",
          planned_amount: fc.monthly_amount,
          actual_amount: null,
          forecast_amount: null,
          origin: "fixed-cost-auto",
        });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date) || a.line_id.localeCompare(b.line_id));
    return items;
  }

  computeSchedule(items: RawLineItem[]): CashflowSchedule {
    const opening = this.loadOpeningBalances();
    let balanceTotal = opening.total;
    const balanceByAccount = { ...opening.byAccount };
    const defaultAccount = Object.keys(balanceByAccount)[0];

    const rows: CashflowScheduleRow[] = [];
    let shortfallDate: string | null = null;
    let shortfallAmount: number | null = null;
    let minimumBalance = opening.total;
    let minimumBalanceDate = this.options.horizonStart;

    for (const item of items) {
      const delta = signedAmount(item.direction, item.amount);
      const account = item.account_id ?? defaultAccount;

      if (item.direction === "transfer" && item.counterparty_account_id) {
        if (account) balanceByAccount[account] = (balanceByAccount[account] ?? 0) - item.amount;
        balanceByAccount[item.counterparty_account_id] =
          (balanceByAccount[item.counterparty_account_id] ?? 0) + item.amount;
      } else {
        balanceTotal += delta;
        if (account) balanceByAccount[account] = (balanceByAccount[account] ?? 0) + delta;
      }

      if (balanceTotal < 0 && !shortfallDate) {
        shortfallDate = item.date;
        shortfallAmount = balanceTotal;
      }
      if (balanceTotal < minimumBalance) {
        minimumBalance = balanceTotal;
        minimumBalanceDate = item.date;
      }

      const period = periodForDate(item.date, this.options.granularity);
      rows.push({
        period_key: period.period_key,
        period_start: period.period_start,
        period_end: period.period_end,
        direction: item.direction,
        category: item.category,
        description: item.description,
        account_id: item.account_id,
        chart_account_id: item.chart_account_id,
        planned_amount: item.planned_amount,
        actual_amount: item.actual_amount,
        forecast_amount: item.forecast_amount,
        balance_total: balanceTotal,
        balance_by_account: { ...balanceByAccount },
        source: item.source,
        line_id: item.line_id,
      });
    }

    let runwayDays: number | null = null;
    if (shortfallDate) {
      runwayDays = Math.max(
        0,
        Math.ceil(
          (new Date(`${shortfallDate}T12:00:00`).getTime() -
            new Date(`${this.options.asOf}T12:00:00`).getTime()) /
            86400000
        )
      );
    } else if (balanceTotal > 0) {
      runwayDays = null;
    }

    return {
      generated_at: new Date().toISOString(),
      granularity: this.options.granularity,
      horizon_start: this.options.horizonStart,
      horizon_end: this.options.horizonEnd,
      opening_balance_total: opening.total,
      opening_balance_by_account: opening.byAccount,
      closing_balance_total: balanceTotal,
      closing_balance_by_account: balanceByAccount,
      runway_days: runwayDays,
      shortfall_date: shortfallDate,
      shortfall_amount: shortfallAmount,
      required_funding_amount: Math.max(0, -minimumBalance),
      required_funding_by_date:
        minimumBalance < 0 ? minimumBalanceDate : null,
      rows: rollupCashflowRows(rows, this.options.granularity),
      warnings: opening.warnings,
    };
  }

  build(): CashflowSchedule {
    const items = resolveCashflowLineItems(this.buildRawLineItems());
    try {
      const resolved = resolveRawLineChartAccounts(items, loadChartOfAccounts());
      const schedule = this.computeSchedule(resolved.items);
      schedule.warnings.push(...resolved.warnings);
      return schedule;
    } catch (error) {
      const schedule = this.computeSchedule(items);
      schedule.warnings.push(
        `chart of accounts is not available: ${error instanceof Error ? error.message : String(error)}`
      );
      return schedule;
    }
  }
}

export function buildCashflowSchedule(options: CashflowBuilderOptions): CashflowSchedule {
  return new CashflowScheduleBuilder(options).build();
}

export function formatCashflowMarkdown(schedule: CashflowSchedule): string {
  const lines = [
    `# 資金繰り表（${schedule.granularity}）`,
    "",
    `生成: ${schedule.generated_at.slice(0, 10)} · 期間: ${schedule.horizon_start} 〜 ${schedule.horizon_end}`,
    "",
    `期首残高: ${formatCurrency(schedule.opening_balance_total)} · 期末残高: ${formatCurrency(schedule.closing_balance_total)}`,
    `必要調達額: ${formatCurrency(schedule.required_funding_amount ?? 0)}${schedule.required_funding_by_date ? `（${schedule.required_funding_by_date} まで）` : ""}`,
  ];
  if (schedule.shortfall_date) {
    lines.push(
      "",
      `⚠ 資金ショート: ${schedule.shortfall_date}（${formatCurrency(schedule.shortfall_amount ?? 0)}） · ランウェイ ${schedule.runway_days ?? 0} 日`
    );
  }
  if (schedule.warnings.length) {
    lines.push("", "## 警告", ...schedule.warnings.map((w) => `- ${w}`));
  }
  lines.push(
    "",
    "| 期間 | 方向 | 区分 | 内容 | 計画 | 実績 | 予測 | 残高 | 口座 |",
    "|------|------|------|------|-----:|-----:|-----:|-----:|------|"
  );
  for (const r of schedule.rows) {
    lines.push(
      `| ${r.period_key} | ${r.direction} | ${r.category} | ${r.description} | ${formatCurrency(r.planned_amount)} | ${r.actual_amount != null ? formatCurrency(r.actual_amount) : "—"} | ${r.forecast_amount != null ? formatCurrency(r.forecast_amount) : "—"} | ${formatCurrency(r.balance_total)} | ${r.account_id ?? "—"} |`
    );
  }
  return lines.join("\n");
}

export function formatCashflowCsv(schedule: CashflowSchedule): string {
  const header =
    "period_key,period_start,period_end,direction,category,description,planned_amount,actual_amount,forecast_amount,balance_total,account_id,chart_account_id,source,line_id,required_funding_amount,required_funding_by_date";
  const csvCell = (value: string | number | null | undefined): string => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = schedule.rows.map((r) =>
    [
      r.period_key,
      r.period_start,
      r.period_end,
      r.direction,
      r.category,
      r.description,
      r.planned_amount,
      r.actual_amount ?? "",
      r.forecast_amount ?? "",
      r.balance_total,
      r.account_id ?? "",
      r.chart_account_id ?? "",
      r.source,
      r.line_id ?? "",
      schedule.required_funding_amount ?? "",
      schedule.required_funding_by_date ?? "",
    ].map(csvCell).join(",")
  );
  return [header, ...body].join("\n");
}

export function formatCashflowJson(schedule: CashflowSchedule): string {
  return JSON.stringify(schedule, null, 2);
}

export { currentMonth };
