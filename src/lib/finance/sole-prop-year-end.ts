/**
 * Sole-prop calendar-year readiness (coverage, locks, VAT net, withholding tie-out).
 * Warnings only — seasonal / demo tenants must still validate.
 */
import { loadChartOfAccounts } from "../data.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { latestLockForMonth } from "./period-lock.js";
import { loadPresentationSnapshots } from "./financial-presentation-sanity.js";
import {
  assessBlueReturnSetup,
  loadBlueReturnSetup,
} from "./sole-proprietor-clarify.js";
import { loadBlueReturnIncomeDeductions } from "./sole-proprietor-blue-return.js";
import { resolveSolePropCalendarYear } from "./sole-prop-year.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { businessCalendarDay } from "../utils.js";
import {
  filterPaymentsForYear,
  loadWithholdingPayments,
  resolvePaymentAmounts,
} from "./withholding-payments.js";

export type SolePropYearEndIssue = {
  code: string;
  level: "warning";
  file: string;
  message: string;
  hint?: string;
};

export function calendarMonthsInYear(
  year: number,
  booksStartMonth?: string,
): string[] {
  let startM = 1;
  if (booksStartMonth && /^\d{4}-\d{2}$/.test(booksStartMonth)) {
    const [sy, sm] = booksStartMonth.split("-").map(Number);
    if (sy === year && sm != null && sm >= 1 && sm <= 12) startM = sm;
    if (sy != null && sy > year) return [];
  }
  const months: string[] = [];
  for (let m = startM; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

export function isConsumptionTaxableStatus(status?: string): boolean {
  if (!status) return false;
  if (status.includes("免税")) return false;
  return status.includes("課税");
}

function tbBalanceYen(code: string, asOf: string): number {
  const row = buildTrialBalance({ asOf }).rows.find((r) => r.account_code === code);
  return row?.balance_yen ?? 0;
}

export function consumptionTaxNetPayableYen(year: number): {
  output_yen: number;
  input_yen: number;
  net_payable_yen: number;
  output_code: string;
  input_code: string;
  unpaid_code: string;
} {
  const coa = loadChartOfAccounts();
  const output_code = coa.journal_source_accounts?.consumption_tax_payable ?? "2160";
  const input_code = coa.journal_source_accounts?.consumption_tax_receivable ?? "2170";
  const unpaid_code = coa.journal_source_accounts?.consumption_tax_unpaid ?? "2180";
  const asOf = `${year}-12-31`;
  const output_yen = tbBalanceYen(output_code, asOf);
  const input_yen = tbBalanceYen(input_code, asOf);
  return {
    output_yen,
    input_yen,
    net_payable_yen: output_yen - input_yen,
    output_code,
    input_code,
    unpaid_code,
  };
}

export function consumptionYearEndEntryId(year: number): string {
  return `JE-CT-YE-${year}`;
}

export function journalMonthsPresent(year: number): Set<string> {
  const months = new Set<string>();
  for (const e of loadJournalEntries().entries) {
    const day = businessCalendarDay(e.occurred_at);
    if (day.startsWith(`${year}-`)) months.add(day.slice(0, 7));
  }
  return months;
}

export function emptyJournalMonths(year: number, booksStartMonth?: string): string[] {
  const present = journalMonthsPresent(year);
  return calendarMonthsInYear(year, booksStartMonth).filter((m) => !present.has(m));
}

export function unlockedCalendarMonths(
  year: number,
  booksStartMonth?: string,
): string[] {
  return calendarMonthsInYear(year, booksStartMonth).filter((m) => {
    const latest = latestLockForMonth(m);
    return latest?.status !== "locked";
  });
}

/** CY remittance JEs that debit 預り金 (source.kind=remittance · obligation=withholding). */
export function remittedWithholdingYen(year: number, payableCode: string): number {
  let sum = 0;
  for (const e of loadJournalEntries().entries) {
    const src = e.source;
    if (src?.kind !== "remittance" || src.obligation !== "withholding") continue;
    const day = businessCalendarDay(e.occurred_at);
    if (!day.startsWith(`${year}-`)) continue;
    for (const line of e.lines) {
      if (line.account_code === payableCode) sum += line.debit_yen;
    }
  }
  return sum;
}

/**
 * Unpaid withholding: YAML accruals minus remittance JEs, vs GL 預り金.
 * Does not prove that expense-side accrual JEs exist.
 */
export function reconcileWithholdingVsGl(year: number): {
  yaml_accrued_yen: number;
  /** @deprecated alias of yaml_accrued_yen */
  yaml_total_yen: number;
  remitted_yen: number;
  expected_unpaid_yen: number;
  gl_unpaid_yen: number;
  /** @deprecated alias of gl_unpaid_yen */
  gl_yen: number;
  delta_yen: number;
  payable_code: string;
} {
  const coa = loadChartOfAccounts();
  const payable_code = coa.journal_source_accounts?.withholding_payable ?? "2120";
  const payments = filterPaymentsForYear(loadWithholdingPayments(), year);
  const yaml_accrued_yen = payments.reduce(
    (s, p) => s + resolvePaymentAmounts(p).withholding_yen,
    0,
  );
  const remitted_yen = remittedWithholdingYen(year, payable_code);
  const expected_unpaid_yen = yaml_accrued_yen - remitted_yen;
  const rawGl = tbBalanceYen(payable_code, `${year}-12-31`);
  const gl_unpaid_yen = rawGl === 0 ? 0 : rawGl;
  return {
    yaml_accrued_yen,
    yaml_total_yen: yaml_accrued_yen,
    remitted_yen,
    expected_unpaid_yen,
    gl_unpaid_yen,
    gl_yen: gl_unpaid_yen,
    delta_yen: expected_unpaid_yen - gl_unpaid_yen,
    payable_code,
  };
}

export function assessSolePropYearEnd(calendarYear?: number): {
  year: number;
  empty_months: string[];
  unlocked_months: string[];
  consumption: ReturnType<typeof consumptionTaxNetPayableYen> & {
    taxable: boolean;
    reclass_posted: boolean;
  };
  withholding: ReturnType<typeof reconcileWithholdingVsGl> & {
    skipped: boolean;
  };
  deductions_missing: boolean;
  baseline_present: boolean;
  setup_ready: boolean;
  issues: SolePropYearEndIssue[];
} {
  const year = resolveSolePropCalendarYear({ explicit: calendarYear });
  const setup = loadBlueReturnSetup();
  const assessment = assessBlueReturnSetup(setup);
  const booksStart = setup?.books_start_month;
  const empty_months = emptyJournalMonths(year, booksStart);
  const unlocked_months = unlockedCalendarMonths(year, booksStart);
  const vat = consumptionTaxNetPayableYen(year);
  const taxable = isConsumptionTaxableStatus(setup?.consumption?.status);
  const reclass_posted = loadJournalEntries().entries.some(
    (e) => e.entry_id === consumptionYearEndEntryId(year),
  );
  const skipWh = setup?.has_withholding_outsourcing === false;
  const withholding = reconcileWithholdingVsGl(year);
  const { missing: deductions_missing } = loadBlueReturnIncomeDeductions(year);
  const snaps = loadPresentationSnapshots();
  const baseline_present = Boolean(snaps.by_period[String(year)]);
  const issues: SolePropYearEndIssue[] = [];

  if (
    empty_months.length > 0 &&
    setup?.journal_coverage?.acknowledge_empty_months !== true
  ) {
    issues.push({
      code: "journal_months_empty",
      level: "warning",
      file: "data/finance/journal-entries.yaml",
      message: `${year} 年の仕訳が無い月: ${empty_months.join(", ")}`,
      hint: "journal_coverage.acknowledge_empty_months: true で抑制（季節・デモ）",
    });
  }

  if (unlocked_months.length > 0) {
    const shown = unlocked_months.slice(0, 12).join(", ");
    issues.push({
      code: "period_locks_incomplete",
      level: "warning",
      file: "data/finance/period-locks.yaml",
      message: `${year} 年の未 lock 月: ${shown}`,
      hint: "orgos ledger period lock --month YYYY-MM",
    });
  }

  if (taxable && Math.abs(vat.net_payable_yen) > 1 && !reclass_posted) {
    issues.push({
      code: "consumption_year_end_unreclassed",
      level: "warning",
      file: "data/finance/journal-entries.yaml",
      message: `消費税仮受/仮払が年末残（ネット ${vat.net_payable_yen} 円）— 期末振替 JE なし`,
      hint: `orgos operations tax-consumption year-end-reclass --year ${year}`,
    });
  }

  if (!skipWh && Math.abs(withholding.delta_yen) > 1) {
    issues.push({
      code: "withholding_yaml_gl_mismatch",
      level: "warning",
      file: "data/finance/withholding-payments.yaml",
      message: `源泉未納付 期待 ${withholding.expected_unpaid_yen} vs GL ${withholding.payable_code} ${withholding.gl_unpaid_yen}（発生 YAML ${withholding.yaml_accrued_yen} − 納付 JE ${withholding.remitted_yen}、差 ${withholding.delta_yen}）`,
      hint: `orgos operations withholding reconcile --year ${year}（納付は source.kind=remittance）`,
    });
  }

  return {
    year,
    empty_months,
    unlocked_months,
    consumption: { ...vat, taxable, reclass_posted },
    withholding: { ...withholding, skipped: skipWh },
    deductions_missing,
    baseline_present,
    setup_ready: assessment.ready && !assessment.file_missing,
    issues,
  };
}
