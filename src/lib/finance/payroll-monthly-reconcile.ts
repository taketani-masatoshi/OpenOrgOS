/**
 * Reconcile payroll.yaml (plan SSOT) with monthly books (category: payroll / CoA 5300).
 * Read-only compare — not part of personal expense envelopes.
 */
import type {
  ChartOfAccounts,
  MonthlyFinance,
} from "../../../schemas/finance/types.js";
import { loadChartOfAccounts, loadMonthlyFinances, loadPayroll } from "../data.js";
import {
  monthInPayrollWindow,
  tryResolvePayrollFiscalWindow,
  type PayrollFiscalWindow,
} from "./payroll-fiscal-window.js";

export type PayrollReconcileMonth = {
  month: string;
  basis: MonthlyFinance["basis"];
  booked_yen: number;
  expected_yen: number;
  variance_yen: number;
};

export type PayrollReconcileOfficer = {
  name: string;
  role?: string;
  employee_id?: string;
  monthly_yen: number;
};

export type PayrollReconcileReport = {
  account_code: string;
  source_payroll: string;
  source_monthly: string;
  fiscal_year: string;
  period_from: string;
  period_to: string;
  period_source: string;
  expected_monthly_yen: number;
  officer_monthly_yen: number;
  employee_monthly_yen: number;
  officers: PayrollReconcileOfficer[];
  employee_ids: string[];
  months: PayrollReconcileMonth[];
  actual_months: number;
  empty_actual_months: number;
  actual_booked_yen: number;
  actual_expected_yen: number;
  actual_variance_yen: number;
  ok: boolean;
  notes: string[];
};

export type PayrollPersonKind = "officer" | "employee" | "none";

export type PayrollPersonReconcile = {
  employee_id: string;
  kind: PayrollPersonKind;
  display_name: string;
  role?: string;
  expected_monthly_yen: number;
  fiscal_year: string;
  period_from: string;
  period_to: string;
  months: PayrollReconcileMonth[];
  actual_months: number;
  empty_actual_months: number;
  actual_booked_yen: number;
  actual_expected_yen: number;
  actual_variance_yen: number;
  ok: boolean;
  account_code: string;
};

type PayrollFile = NonNullable<ReturnType<typeof loadPayroll>>;

function payrollAccountCode(
  payroll: PayrollFile | null,
  chart: ChartOfAccounts,
): string {
  if (payroll?.account_code) return payroll.account_code;
  const mapped = chart.category_mapping.expense.payroll;
  if (mapped) return mapped;
  const named = chart.accounts.find(
    (row) => row.type === "expense" && row.name.includes("役員報酬"),
  );
  return named?.code ?? "5300";
}

function expectedMonthlyYen(payroll: PayrollFile): {
  total: number;
  officer: number;
  employee: number;
} {
  const officer = (payroll.officers ?? []).reduce(
    (sum, row) => sum + (row.monthly ?? 0),
    0,
  );
  const employee = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  return { total: officer + employee, officer, employee };
}

/** Expected monthly compensation for one employee_id from payroll.yaml. */
export function expectedMonthlyForEmployee(
  payroll: PayrollFile,
  employeeId: string,
): { kind: PayrollPersonKind; monthly_yen: number; name: string; role?: string } {
  const officer = (payroll.officers ?? []).find(
    (row) => row.employee_id === employeeId,
  );
  if (officer) {
    return {
      kind: "officer",
      monthly_yen: officer.monthly ?? 0,
      name: officer.name,
      role: officer.role,
    };
  }
  const ids = payroll.employee_payroll?.employee_ids ?? [];
  if (ids.includes(employeeId)) {
    const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
    const share = ids.length > 0 ? Math.round(gross / ids.length) : 0;
    return {
      kind: "employee",
      monthly_yen: share,
      name: employeeId,
    };
  }
  return { kind: "none", monthly_yen: 0, name: employeeId };
}

function isPayrollExpense(
  expense: MonthlyFinance["expenses"][number],
  chart: ChartOfAccounts,
  accountCode: string,
): boolean {
  const code =
    expense.chart_account_code ??
    chart.category_mapping.expense[expense.category];
  return expense.category === "payroll" || code === accountCode;
}

function bookedPayrollYen(
  month: MonthlyFinance,
  chart: ChartOfAccounts,
  accountCode: string,
  employeeId?: string,
): number {
  let sum = 0;
  for (const expense of month.expenses) {
    if (!isPayrollExpense(expense, chart, accountCode)) continue;
    if (!employeeId) {
      sum += Math.abs(expense.amount);
      continue;
    }
    const allocs = expense.allocations ?? [];
    if (allocs.length === 0) continue;
    for (const alloc of allocs) {
      if (alloc.employee_id === employeeId) {
        sum += Math.abs(alloc.amount);
      }
    }
  }
  return sum;
}

function summarizeMonths(
  rows: PayrollReconcileMonth[],
  expectedMonthly: number,
): Pick<
  PayrollReconcileReport,
  | "actual_months"
  | "empty_actual_months"
  | "actual_booked_yen"
  | "actual_expected_yen"
  | "actual_variance_yen"
  | "ok"
> {
  // In-window actual months all count toward equality (P2).
  // Pre-period months are excluded earlier via fiscal window filter.
  // Missing month files are out of scope (not present in rows).
  const actualRows = rows.filter((row) => row.basis === "actual");
  const emptyActualMonths = actualRows.filter((row) => row.booked_yen === 0).length;
  const actualBooked = actualRows.reduce((sum, row) => sum + row.booked_yen, 0);
  const actualExpected = expectedMonthly * actualRows.length;
  const actualVariance = actualBooked - actualExpected;
  return {
    actual_months: actualRows.length,
    empty_actual_months: emptyActualMonths,
    actual_booked_yen: actualBooked,
    actual_expected_yen: actualExpected,
    actual_variance_yen: actualVariance,
    ok: actualVariance === 0,
  };
}

type ResolvedWindow = {
  window: PayrollFiscalWindow | null;
  /** true when FY filter is intentionally disabled (tests). */
  disabled: boolean;
  /** true when tenant/opts could not resolve a window. */
  unresolved: boolean;
};

function resolveWindow(opts?: {
  fiscalWindow?: PayrollFiscalWindow | null;
  fiscalYear?: string;
  periodFrom?: string;
  periodTo?: string;
  fiscalYearEndMonth?: number;
  asOfYm?: string;
}): ResolvedWindow {
  if (opts?.fiscalWindow === null) {
    return { window: null, disabled: true, unresolved: false };
  }
  if (opts?.fiscalWindow) {
    return { window: opts.fiscalWindow, disabled: false, unresolved: false };
  }
  const window = tryResolvePayrollFiscalWindow({
    fiscalYear: opts?.fiscalYear,
    periodFrom: opts?.periodFrom,
    periodTo: opts?.periodTo,
    fiscalYearEndMonth: opts?.fiscalYearEndMonth,
    asOfYm: opts?.asOfYm,
  });
  return {
    window,
    disabled: false,
    unresolved: window == null,
  };
}

function filterMonthsToWindow(
  months: MonthlyFinance[],
  resolved: ResolvedWindow,
): MonthlyFinance[] {
  if (resolved.disabled) return months;
  if (resolved.unresolved || !resolved.window) return [];
  return months.filter((month) =>
    monthInPayrollWindow(month.month, resolved.window!),
  );
}

export function buildPayrollMonthlyReconcile(opts?: {
  months?: MonthlyFinance[];
  payroll?: PayrollFile | null;
  chart?: ChartOfAccounts;
  /** Only compare months with this basis (default: actual). */
  basis?: MonthlyFinance["basis"] | "any";
  fiscalYear?: string;
  periodFrom?: string;
  periodTo?: string;
  fiscalYearEndMonth?: number;
  asOfYm?: string;
  /** Pass null to disable FY filtering (tests). */
  fiscalWindow?: PayrollFiscalWindow | null;
}): PayrollReconcileReport {
  let payroll = opts?.payroll;
  if (payroll === undefined) {
    try {
      payroll = loadPayroll();
    } catch {
      payroll = null;
    }
  }
  const chart = opts?.chart ?? loadChartOfAccounts();
  const resolved = resolveWindow(opts);
  const window = resolved.window;
  const months = filterMonthsToWindow(
    opts?.months ?? loadMonthlyFinances(),
    resolved,
  );
  const basis = opts?.basis ?? "actual";
  const periodMeta = {
    fiscal_year: window?.fiscal_year ?? "",
    period_from: window?.period_from ?? "",
    period_to: window?.period_to ?? "",
    period_source: resolved.unresolved
      ? "unresolved"
      : (window?.source ?? "none"),
  };
  if (!payroll) {
    return {
      account_code: chart.category_mapping.expense.payroll ?? "5300",
      source_payroll: "data/finance/payroll.yaml",
      source_monthly: "data/finance/monthly/*.yaml",
      ...periodMeta,
      expected_monthly_yen: 0,
      officer_monthly_yen: 0,
      employee_monthly_yen: 0,
      officers: [],
      employee_ids: [],
      months: [],
      actual_months: 0,
      empty_actual_months: 0,
      actual_booked_yen: 0,
      actual_expected_yen: 0,
      actual_variance_yen: 0,
      ok: true,
      notes: ["payroll.yaml が無いため突合をスキップしました。"],
    };
  }
  const accountCode = payrollAccountCode(payroll, chart);
  const expected = expectedMonthlyYen(payroll);
  const officers: PayrollReconcileOfficer[] = (payroll.officers ?? []).map(
    (row) => ({
      name: row.name,
      role: row.role,
      employee_id: row.employee_id,
      monthly_yen: row.monthly ?? 0,
    }),
  );
  const employeeIds = payroll.employee_payroll?.employee_ids ?? [];

  const rows: PayrollReconcileMonth[] = months
    .filter((month) => (basis === "any" ? true : month.basis === basis))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((month) => {
      const booked = bookedPayrollYen(month, chart, accountCode);
      return {
        month: month.month,
        basis: month.basis,
        booked_yen: booked,
        expected_yen: expected.total,
        variance_yen: booked - expected.total,
      };
    });

  const summary = summarizeMonths(rows, expected.total);
  const notes: string[] = [
    "個人経費枠（budget_delegation: person）とは別レーンです。",
    "差分は payroll.yaml と月次 category: payroll の突合結果です。",
    "対象期間内の実績月は計上 0 円でも一致判定に含めます（期中未計上は不一致）。",
  ];
  if (window) {
    notes.push(
      `対象期間は ${window.fiscal_year} の ${window.period_from}〜${window.period_to}（${window.source}）です。期首前の月は突合しません。`,
    );
  } else if (resolved.unresolved) {
    notes.push(
      "会計期間を解決できませんでした。tax-profile の period_from/period_to または決算月を設定してください。",
    );
  }
  if (basis === "actual") {
    const provisionalInWindow = months.filter(
      (month) => month.basis === "provisional",
    ).length;
    if (provisionalInWindow > 0) {
      notes.push(
        `対象期間に provisional が ${provisionalInWindow} か月あります（既定の突合は actual のみ）。`,
      );
    }
  }
  if (summary.empty_actual_months > 0 && expected.total > 0) {
    notes.push(
      `対象期間の実績月のうち ${summary.empty_actual_months} か月は人件費 0 円です（一致判定に含む・未計上の可能性）。`,
    );
  }
  const missingOfficerIds = officers.filter(
    (row) => row.monthly_yen > 0 && !row.employee_id,
  );
  if (missingOfficerIds.length > 0) {
    notes.push(
      `役員 ${missingOfficerIds.map((r) => r.name).join("・")} に employee_id がありません（個人突合不可）。`,
    );
  }

  return {
    account_code: accountCode,
    source_payroll: "data/finance/payroll.yaml",
    source_monthly: "data/finance/monthly/*.yaml",
    ...periodMeta,
    expected_monthly_yen: expected.total,
    officer_monthly_yen: expected.officer,
    employee_monthly_yen: expected.employee,
    officers,
    employee_ids: employeeIds,
    months: rows,
    ...summary,
    notes,
  };
}

/** Person-scoped payroll vs books (by employee_id on monthly allocations). */
export function buildPayrollPersonReconcile(opts: {
  employeeId: string;
  months?: MonthlyFinance[];
  payroll?: PayrollFile | null;
  chart?: ChartOfAccounts;
  basis?: MonthlyFinance["basis"] | "any";
  displayName?: string;
  fiscalYear?: string;
  periodFrom?: string;
  periodTo?: string;
  fiscalYearEndMonth?: number;
  asOfYm?: string;
  fiscalWindow?: PayrollFiscalWindow | null;
}): PayrollPersonReconcile {
  let payroll = opts.payroll;
  if (payroll === undefined) {
    try {
      payroll = loadPayroll();
    } catch {
      payroll = null;
    }
  }
  const chart = opts.chart ?? loadChartOfAccounts();
  const resolved = resolveWindow(opts);
  const window = resolved.window;
  const months = filterMonthsToWindow(
    opts.months ?? loadMonthlyFinances(),
    resolved,
  );
  const basis = opts.basis ?? "actual";
  const accountCode = payrollAccountCode(payroll, chart);
  const periodMeta = {
    fiscal_year: window?.fiscal_year ?? "",
    period_from: window?.period_from ?? "",
    period_to: window?.period_to ?? "",
  };
  if (!payroll) {
    return {
      employee_id: opts.employeeId,
      kind: "none",
      display_name: opts.displayName ?? opts.employeeId,
      expected_monthly_yen: 0,
      ...periodMeta,
      months: [],
      actual_months: 0,
      empty_actual_months: 0,
      actual_booked_yen: 0,
      actual_expected_yen: 0,
      actual_variance_yen: 0,
      ok: true,
      account_code: accountCode,
    };
  }
  const expected = expectedMonthlyForEmployee(payroll, opts.employeeId);
  const rows: PayrollReconcileMonth[] = months
    .filter((month) => (basis === "any" ? true : month.basis === basis))
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((month) => {
      const booked = bookedPayrollYen(
        month,
        chart,
        accountCode,
        opts.employeeId,
      );
      return {
        month: month.month,
        basis: month.basis,
        booked_yen: booked,
        expected_yen: expected.monthly_yen,
        variance_yen: booked - expected.monthly_yen,
      };
    });
  const summary = summarizeMonths(rows, expected.monthly_yen);
  /** Zero-expected officers (e.g. unpaid) with no books are OK. */
  const ok =
    expected.kind === "none"
      ? summary.actual_booked_yen === 0
      : expected.monthly_yen === 0
        ? summary.actual_booked_yen === 0
        : summary.ok;
  return {
    employee_id: opts.employeeId,
    kind: expected.kind,
    display_name: opts.displayName ?? expected.name,
    role: expected.role,
    expected_monthly_yen: expected.monthly_yen,
    ...periodMeta,
    months: rows,
    ...summary,
    ok,
    account_code: accountCode,
  };
}

export function formatPayrollReconcileMarkdown(
  report: PayrollReconcileReport,
): string {
  const lines = [
    "# 人件費 月次突合（payroll ↔ monthly）",
    "",
    `- 正本: \`${report.source_payroll}\``,
    `- 月次: \`${report.source_monthly}\``,
    `- 対象期間: ${report.fiscal_year} ${report.period_from}〜${report.period_to}（${report.period_source}）`,
    `- 科目: ${report.account_code}`,
    `- 月次期待額: ¥${report.expected_monthly_yen.toLocaleString("ja-JP")}（役員 ¥${report.officer_monthly_yen.toLocaleString("ja-JP")} + 従業員 ¥${report.employee_monthly_yen.toLocaleString("ja-JP")}）`,
    `- 実績月数: ${report.actual_months}`,
    `- 実績計上合計: ¥${report.actual_booked_yen.toLocaleString("ja-JP")}`,
    `- 期待合計: ¥${report.actual_expected_yen.toLocaleString("ja-JP")}`,
    `- 差分: ¥${report.actual_variance_yen.toLocaleString("ja-JP")}（${report.ok ? "一致" : "不一致"}）`,
    "",
    "| 月 | basis | 計上 | 期待 | 差 |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.months.map(
      (row) =>
        `| ${row.month} | ${row.basis} | ${row.booked_yen} | ${row.expected_yen} | ${row.variance_yen} |`,
    ),
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
    "*生成: `orgos finances payroll reconcile`*",
    "",
  ];
  return lines.join("\n");
}
