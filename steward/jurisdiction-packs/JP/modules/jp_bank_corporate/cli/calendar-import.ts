import type { PaymentCalendarEntry } from "../../../../../../schemas/jp-bank-corporate.js";
import {
  loadAllData,
  loadCashBalance,
  loadChartOfAccounts,
  loadContracts,
  loadPayroll,
  loadTaxProfile,
  loadYojitsuFyPlan,
} from "../../../../../../src/lib/data.js";
import { addMonths, currentDate } from "../../../../../../src/lib/utils.js";
import { addCalendarDays } from "./collection-terms.js";
import { loadPaymentCalendar } from "./data-loaders.js";
import { resolveChartAccountId } from "./chart-account.js";

export type CalendarImportSource = "payroll" | "tax" | "yojitsu" | "contracts";

export interface CalendarImportOptions {
  from: CalendarImportSource;
  fy?: string;
  month?: string;
  asOf?: string;
}

export interface CalendarImportResult {
  entries: PaymentCalendarEntry[];
  warnings: string[];
  fiscalYear?: string;
  month?: string;
}

function loadTenantPaymentCalendar() {
  const calendar = loadPaymentCalendar();
  return calendar && !calendar.path.endsWith(".example") ? calendar : null;
}

function normalizeFy(fy: string): string {
  const match = fy.match(/^(?:FY)?(\d{4})$/i);
  if (!match) throw new Error(`Invalid fiscal year "${fy}" — use FY2026`);
  return `FY${match[1]}`;
}

function monthEnd(month: string): string {
  return addCalendarDays(`${addMonths(month, 1)}-01`, -1);
}

function dateWithDay(month: string, day: number): string | undefined {
  const candidate = `${month}-${String(day).padStart(2, "0")}`;
  return candidate <= monthEnd(month) ? candidate : undefined;
}

function currentTargetMonth(options: CalendarImportOptions): string {
  return options.month ?? (options.asOf ?? currentDate()).slice(0, 7);
}

export function resolveDefaultAccountId(): string | undefined {
  const calendarAccount = loadTenantPaymentCalendar()?.data.entries.find(
    (entry) => entry.account_id
  )?.account_id;
  if (calendarAccount) return calendarAccount;
  return loadCashBalance()?.accounts
    .map((account) => account.bank_account_id ?? account.id)
    .find((id): id is string => Boolean(id));
}

function resolveYojitsu(options: CalendarImportOptions) {
  const month = currentTargetMonth(options);
  const year = Number(month.slice(0, 4));
  const candidates = options.fy
    ? [normalizeFy(options.fy)]
    : [`FY${year}`, `FY${year - 1}`];
  for (const fiscalYear of candidates) {
    const plan = loadYojitsuFyPlan(fiscalYear);
    if (plan?.months.some((row) => row.month === month) || (!options.month && plan)) {
      return { fiscalYear, plan };
    }
  }
  return { fiscalYear: candidates[0], plan: undefined };
}

function makeEntry(
  entry: Omit<PaymentCalendarEntry, "source" | "status">,
  accountId?: string
): PaymentCalendarEntry {
  return {
    ...entry,
    account_id: entry.account_id ?? accountId,
    source: "import",
    status: "planned",
  };
}

function payrollEntries(
  options: CalendarImportOptions,
  accountId: string | undefined,
  warnings: string[]
): PaymentCalendarEntry[] {
  const month = currentTargetMonth(options);
  const data = loadAllData();
  const monthly = data.monthlyFinances.find((row) => row.month === month);
  const bookedAmounts =
    monthly?.expenses
      .filter((expense) => /給与|給料|賞与|賃金/.test(expense.notes ?? ""))
      .map((expense) => expense.amount) ?? [];
  let amount = bookedAmounts.reduce((sum, value) => sum + value, 0);
  let basis = "monthly finance";

  if (!amount) {
    const payroll = loadPayroll();
    amount =
      payroll.officers?.reduce(
        (sum, officer) => sum + (officer.monthly ?? (officer.annual ? officer.annual / 12 : 0)),
        0
      ) ?? payroll.officer_compensation_annual / 12;
    basis = "payroll";
  }
  if (!amount) {
    warnings.push(`${month}: payroll amount is not available; no entry imported`);
    return [];
  }

  const knownPayroll = loadTenantPaymentCalendar()?.data.entries.find((entry) =>
    /給与|給料|賞与|賃金/.test(`${entry.category} ${entry.description}`)
  );
  const payDay = knownPayroll ? Number(knownPayroll.date.slice(8, 10)) : undefined;
  const date = payDay ? dateWithDay(month, payDay) : undefined;
  if (!date) {
    warnings.push(`${month}: payroll payment day is not available; no entry imported`);
    return [];
  }

  return [
    makeEntry(
      {
        id: `PAY-IMPORT-${month}`,
        date,
        direction: "outflow",
        amount,
        category: "給与",
        chart_account_id: knownPayroll?.chart_account_id,
        description: `${month} 給与支払（${basis} import）`,
      },
      accountId
    ),
  ];
}

function taxEntries(
  options: CalendarImportOptions,
  accountId: string | undefined,
  warnings: string[]
): PaymentCalendarEntry[] {
  const tax = loadTaxProfile();
  const fiscalYear = options.fy ? normalizeFy(options.fy) : undefined;
  const estimate =
    "corporate_tax" in tax && tax.corporate_tax && "estimated_tax_fy2026" in tax.corporate_tax
      ? tax.corporate_tax.estimated_tax_fy2026
      : undefined;
  const entries: PaymentCalendarEntry[] = [];

  for (const filing of tax.filing_calendar) {
    if (filing.status === "not_required" || !filing.deadline) continue;
    if (options.month && filing.deadline.slice(0, 7) !== options.month) continue;
    const isEstimatedCorporateTax =
      filing.id === "hojinzei-kokuzei" && (!fiscalYear || fiscalYear === "FY2026");
    const amount = isEstimatedCorporateTax ? estimate : undefined;
    if (!amount) {
      warnings.push(`${filing.id}: tax amount is not available; no entry imported`);
      continue;
    }
    entries.push(
      makeEntry(
        {
          id: `TAX-IMPORT-${filing.id}-${filing.deadline}`,
          date: filing.deadline,
          direction: "outflow",
          amount,
          category: filing.tax,
          description: `${filing.tax}（tax-profile import）`,
        },
        accountId
      )
    );
  }
  return entries;
}

function yojitsuEntries(
  options: CalendarImportOptions,
  accountId: string | undefined,
  warnings: string[]
): { entries: PaymentCalendarEntry[]; fiscalYear: string } {
  const { fiscalYear, plan } = resolveYojitsu(options);
  if (!plan) {
    warnings.push(`${fiscalYear}: yojitsu plan is not available; no entry imported`);
    return { entries: [], fiscalYear };
  }

  const rows = options.month
    ? plan.months.filter((row) => row.month === options.month)
    : plan.months;
  const entries = rows.flatMap((row) => {
    const actual = row.actual?.lines?.filter((line) => line.kind === "capex") ?? [];
    const planned = row.plan.lines.filter((line) => line.kind === "capex");
    const lines = actual.length ? actual : planned;
    return lines
      .filter((line) => line.amount > 0)
      .map((line, index) =>
        makeEntry(
          {
            id: `CAPEX-IMPORT-${fiscalYear}-${row.month}-${index + 1}`,
            date: monthEnd(row.month),
            direction: "outflow" as const,
            amount: line.amount,
            category: "設備投資",
            description: `${line.label ?? line.segment}（yojitsu ${actual.length ? "actual" : "plan"} import）`,
          },
          accountId
        )
      );
  });
  return { entries, fiscalYear };
}

function contractDueDate(paymentTerms: string | undefined, targetMonth: string): string | undefined {
  if (!paymentTerms) return undefined;
  const explicit = paymentTerms.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (explicit) return explicit;
  const nextMonthDay = paymentTerms.match(/翌月\s*(\d{1,2})日/)?.[1];
  return nextMonthDay ? dateWithDay(addMonths(targetMonth, 1), Number(nextMonthDay)) : undefined;
}

function contractEntries(
  options: CalendarImportOptions,
  accountId: string | undefined,
  warnings: string[]
): PaymentCalendarEntry[] {
  const month = currentTargetMonth(options);
  const periodEnd = monthEnd(month);
  const entries: PaymentCalendarEntry[] = [];
  for (const contract of loadContracts()) {
    if (
      contract.status !== "executed" ||
      contract.start_date > periodEnd ||
      (contract.end_date && contract.end_date < `${month}-01`)
    ) {
      continue;
    }
    const amount = contract.monthly_cost || contract.compensation?.amount;
    if (!amount) continue;
    const paymentTerms = contract.compensation?.payment_terms;
    const isRecurringMonthly =
      contract.compensation?.type === "monthly" || Boolean(contract.monthly_cost);
    if (
      isRecurringMonthly &&
      paymentTerms?.match(/\b\d{4}-\d{2}-\d{2}\b/) &&
      !paymentTerms.match(/翌月\s*\d{1,2}日/)
    ) {
      warnings.push(
        `${contract.id}: aggregate monthly payment amount is not structured; no entry imported`
      );
      continue;
    }
    const date = contractDueDate(paymentTerms, month);
    if (!date) {
      warnings.push(`${contract.id}: structured payment date is not available; no entry imported`);
      continue;
    }
    if (date.slice(0, 7) < month) continue;
    entries.push(
      makeEntry(
        {
          id: `CTR-IMPORT-${contract.id}-${month}`,
          date,
          direction: "outflow",
          amount,
          category: "契約支払",
          description: `${contract.name}（contracts import）`,
        },
        accountId
      )
    );
  }
  return entries;
}

export function buildCalendarImport(options: CalendarImportOptions): CalendarImportResult {
  const warnings: string[] = [];
  const accountId = resolveDefaultAccountId();
  if (!accountId) warnings.push("default account id is not available");
  let entries: PaymentCalendarEntry[] = [];
  let fiscalYear = options.fy ? normalizeFy(options.fy) : undefined;

  if (options.from === "payroll") entries = payrollEntries(options, accountId, warnings);
  if (options.from === "tax") entries = taxEntries(options, accountId, warnings);
  if (options.from === "contracts") entries = contractEntries(options, accountId, warnings);
  if (options.from === "yojitsu") {
    const result = yojitsuEntries(options, accountId, warnings);
    entries = result.entries;
    fiscalYear = result.fiscalYear;
  }

  try {
    const chart = loadChartOfAccounts();
    entries = entries.map((entry) => {
      const resolved = resolveChartAccountId(
        {
          category: entry.category,
          direction: entry.direction,
          chart_account_id: entry.chart_account_id,
        },
        chart
      );
      if (resolved.warning) warnings.push(`${entry.id}: ${resolved.warning}`);
      return {
        ...entry,
        chart_account_id: resolved.chart_account_id,
      };
    });
  } catch (error) {
    warnings.push(
      `chart of accounts is not available: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    entries: entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    warnings,
    fiscalYear,
    month: options.month,
  };
}
