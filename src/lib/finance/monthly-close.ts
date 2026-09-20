/**
 * Monthly accounting close — one gate for CLI and Workbench.
 * Lock only when error-level gates pass. YAML reconcile is a warning.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runValidateReport } from "../../commands/validate.js";
import { loadChartOfAccounts, loadMonthlyFinances, loadPayroll } from "../data.js";
import { getDataDir } from "../utils.js";
import { buildConsumptionTaxSummary } from "./consumption-tax.js";
import { resolveCloseAdjustmentAmountFromCoa } from "./close-adjustments.js";
import { buildDepreciationSchedule, postDepreciationJournalEntries } from "./depreciation.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import {
  lastDayOfMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "./fiscal-year.js";
import { loadBankStatementsLite } from "./bank-statements-lite.js";
import { postMonthlyPlJournalEntries, postPayrollJournalEntry } from "./journal-sources.js";
import { buildBalanceSheet } from "./ledger/balance-sheet.js";
import { buildMonthlyReconcileReport } from "./ledger/monthly-reconcile.js";
import { subsidiaryLedgerIntegrityIssues } from "./ledger/subsidiary-ledger.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { computePayrollMonth } from "./payroll-jp.js";
import { isMonthLocked, lockMonth } from "./period-lock.js";

const SKIP_MPL_EXPENSE = new Set(["depreciation", "loan_payment", "capex"]);

export type MonthlyCloseGateLevel = "error" | "warning" | "skip";

export type MonthlyCloseGate = {
  id: string;
  label: string;
  pass: boolean;
  level: MonthlyCloseGateLevel;
  detail?: string;
};

export type MonthlyCloseEvaluation = {
  month: string;
  as_of: string;
  can_lock: boolean;
  items: MonthlyCloseGate[];
  warnings: string[];
  errors: string[];
  validate_errors: string[];
};

export type MonthlyCloseResult = {
  month: string;
  posted_entry_ids: string[];
  locked: boolean;
  ok: boolean;
  evaluation: MonthlyCloseEvaluation;
};

function monthKey(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month YYYY-MM is required");
  }
}

function payrollGross(): number {
  try {
    return loadPayroll().employee_payroll?.monthly_gross_jpy ?? 0;
  } catch {
    return 0;
  }
}

function monthlyPlRequired(month: string): boolean {
  const row = loadMonthlyFinances().find((entry) => entry.month === month);
  if (!row) return false;
  const revenue = row.revenue.reduce((sum, line) => sum + line.amount, 0);
  const expense = row.expenses
    .filter((line) => !SKIP_MPL_EXPENSE.has(line.category))
    .reduce((sum, line) => sum + line.amount, 0);
  return revenue > 0 || expense > 0;
}

function monthlyPlPosted(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
      (entry.source?.kind === "closing" &&
        entry.source.period === month &&
        entry.source.adjustment_id.startsWith("monthly-pl-")),
  );
}

function depreciationPosted(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      entry.source?.kind === "depreciation" && entry.source.period === month,
  );
}

function payrollPosted(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) => entry.entry_id === `JE-PAYROLL-${month}`,
  );
}

function bankFileExists(): boolean {
  return existsSync(join(getDataDir(), "finance", "bank-statements.yaml"));
}

/** Unmatched bank rows in the close month. null = no bank file. */
export function unmatchedBankCountForMonth(month: string): number | null {
  if (!bankFileExists()) return null;
  const lite = loadBankStatementsLite();
  if (!lite) return Number.POSITIVE_INFINITY;
  return lite.entries.filter(
    (row) =>
      row.date.slice(0, 7) === month &&
      (!row.status || row.status === "unmatched"),
  ).length;
}

function gate(
  id: string,
  label: string,
  pass: boolean,
  level: MonthlyCloseGateLevel,
  detail?: string,
): MonthlyCloseGate {
  return { id, label, pass, level, ...(detail ? { detail } : {}) };
}

function optionalGate(
  id: string,
  label: string,
  required: boolean,
  posted: boolean,
): MonthlyCloseGate {
  if (!required) {
    return gate(id, label, true, "skip", "not required");
  }
  return gate(id, label, posted, "error", posted ? "posted" : "missing");
}

export function evaluateMonthlyCloseGates(
  month: string,
  opts?: { requireDepreciation?: boolean; requirePayroll?: boolean },
): MonthlyCloseEvaluation {
  monthKey(month);
  const asOf = lastDayOfMonth(month);
  const items: MonthlyCloseGate[] = [];
  const requireDepreciation = opts?.requireDepreciation !== false;
  const requirePayroll = opts?.requirePayroll !== false;

  let depRequired = false;
  let depDetail: string | undefined;
  if (requireDepreciation) {
    try {
      depRequired = buildDepreciationSchedule(month).some(
        (line) => line.monthly_depreciation_yen > 0,
      );
    } catch (error) {
      depDetail = error instanceof Error ? error.message : String(error);
    }
  }
  items.push(
    depDetail
      ? gate("depreciation-posted", "減価償却を計上済み", false, "error", depDetail)
      : optionalGate(
          "depreciation-posted",
          "減価償却を計上済み",
          depRequired,
          depreciationPosted(month),
        ),
  );
  items.push(
    optionalGate(
      "payroll-posted",
      "給与発生を計上済み",
      requirePayroll && payrollGross() > 0,
      payrollPosted(month),
    ),
  );
  items.push(
    optionalGate(
      "monthly-pl-posted",
      "月次損益を計上済み",
      monthlyPlRequired(month),
      monthlyPlPosted(month),
    ),
  );

  const trial = buildTrialBalance({ asOf });
  items.push(
    gate(
      "trial-balance",
      "試算表が一致",
      trial.balanced,
      "error",
      trial.balanced ? "balanced" : trial.issues.join("; ") || "unbalanced",
    ),
  );

  const fiscalYear = resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), month);
  const balanceSheet = buildBalanceSheet({ asOf, fiscalYear });
  items.push(
    gate(
      "balance-sheet",
      "貸借対照表が一致",
      balanceSheet.balanced,
      "error",
      balanceSheet.balanced
        ? "balanced"
        : balanceSheet.issues.join("; ") || "unbalanced",
    ),
  );

  const subsidiary = subsidiaryLedgerIntegrityIssues(asOf);
  items.push(
    gate(
      "subsidiary",
      "補助元帳が統制勘定と一致",
      subsidiary.length === 0,
      "error",
      subsidiary.length === 0 ? "tied out" : subsidiary.join("; "),
    ),
  );

  const unmatched = unmatchedBankCountForMonth(month);
  if (unmatched == null) {
    items.push(
      gate(
        "bank-imported",
        "銀行明細を取込済み",
        false,
        "skip",
        "bank statements not imported",
      ),
    );
    items.push(
      gate(
        "bank-unmatched",
        "銀行明細の未消込なし",
        false,
        "skip",
        "bank statements not imported",
      ),
    );
  } else {
    items.push(gate("bank-imported", "銀行明細を取込済み", true, "error", "ok"));
    items.push(
      gate(
        "bank-unmatched",
        "銀行明細の未消込なし",
        unmatched === 0,
        "error",
        Number.isFinite(unmatched) ? `${unmatched} unmatched` : "bank statements unreadable",
      ),
    );
  }

  let taxDetail = "ok";
  let taxPass = true;
  try {
    buildConsumptionTaxSummary({ period: month });
  } catch (error) {
    taxPass = false;
    taxDetail = error instanceof Error ? error.message : String(error);
  }
  items.push(gate("consumption-tax", "消費税集計", taxPass, "error", taxDetail));

  const validate = runValidateReport({ warnings: true });
  const validateErrors = validate.issues
    .filter(
      (issue) =>
        issue.severity === "error" && issue.path.includes("data/finance/"),
    )
    .map((issue) => `${issue.path}: ${issue.message}`);
  items.push(
    gate(
      "validate",
      "帳簿整合性チェック",
      validateErrors.length === 0,
      "error",
      validateErrors.length === 0
        ? "ok"
        : `${validateErrors.length} errors`,
    ),
  );

  const reconcile = buildMonthlyReconcileReport({ month });
  const reconcileDetail = reconcile.balanced
    ? "balanced"
    : reconcile.diffs
        .map((diff) => `${diff.category} delta ${diff.delta_yen}`)
        .join("; ");
  items.push(
    gate(
      "monthly-reconcile",
      "月次YAML突合",
      reconcile.balanced,
      "warning",
      reconcileDetail || "variance",
    ),
  );

  const errors = items
    .filter((item) => item.level === "error" && !item.pass)
    .map((item) => `${item.id}: ${item.detail ?? "failed"}`);
  const warnings = items
    .filter((item) => item.level === "warning" && !item.pass)
    .map((item) => `${item.id}: ${item.detail ?? "variance"}`);

  return {
    month,
    as_of: asOf,
    can_lock: errors.length === 0,
    items,
    warnings,
    errors,
    validate_errors: validateErrors,
  };
}

function postCloseAdjustments(month: string): string[] {
  const coa = loadChartOfAccounts();
  const posted: string[] = [];
  const asOf = lastDayOfMonth(month);
  for (const adjustment of coa.monthly_close_adjustments ?? []) {
    const amount = resolveCloseAdjustmentAmountFromCoa(
      adjustment.amount_source,
      month,
    );
    if (amount <= 0) continue;
    const entryId = `JE-CLOSE-${month}-${adjustment.trigger}`;
    appendJournalEntry({
      entry_id: entryId,
      occurred_at: `${asOf}T18:00:00.000Z`,
      description: `Monthly close ${adjustment.trigger}`,
      source: {
        kind: "closing",
        period: month,
        adjustment_id: adjustment.trigger,
      },
      evidence_refs: [`close:${month}:${adjustment.trigger}`],
      lines: [
        {
          account_code: adjustment.debit,
          debit_yen: amount,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: adjustment.credit,
          debit_yen: 0,
          credit_yen: amount,
          tax_category: "out_of_scope",
        },
      ],
    });
    posted.push(entryId);
  }
  return posted;
}

function postMonthJournals(
  month: string,
  operatorId: string,
  opts?: { postDepreciation?: boolean; postPayroll?: boolean },
): string[] {
  const posted: string[] = [];
  if (opts?.postDepreciation !== false) {
    posted.push(
      ...postDepreciationJournalEntries({
        period: month,
        authorizedBy: operatorId,
      }),
    );
  }
  if (opts?.postPayroll !== false && payrollGross() > 0) {
    const computed = computePayrollMonth({
      month,
      grossYen: payrollGross(),
    });
    const payrollEntry = postPayrollJournalEntry({
      period: month,
      authorizedBy: operatorId,
      grossYen: computed.gross_yen,
      withholdingYen: computed.withholding_yen,
      socialEmployerYen: computed.social_insurance.employer_total_yen,
    });
    if (payrollEntry) posted.push(payrollEntry);
  }
  posted.push(
    ...postMonthlyPlJournalEntries({
      period: month,
      authorizedBy: operatorId,
    }),
  );
  posted.push(...postCloseAdjustments(month));
  return posted;
}

/**
 * Post month-end journals, then lock only if error gates pass.
 * A month that is already locked is not posted into and is not unlocked.
 */
export function closeAccountingMonth(input: {
  month: string;
  operatorId: string;
  postDepreciation?: boolean;
  postPayroll?: boolean;
}): MonthlyCloseResult {
  monthKey(input.month);
  const posted = isMonthLocked(input.month)
    ? []
    : postMonthJournals(input.month, input.operatorId, {
        postDepreciation: input.postDepreciation,
        postPayroll: input.postPayroll,
      });
  const evaluation = evaluateMonthlyCloseGates(input.month, {
    requireDepreciation: input.postDepreciation,
    requirePayroll: input.postPayroll,
  });
  let locked = isMonthLocked(input.month);
  if (evaluation.can_lock && !locked) {
    lockMonth({
      month: input.month,
      lockedBy: input.operatorId,
      reason: "finances close",
    });
    locked = true;
  }
  return {
    month: input.month,
    posted_entry_ids: posted,
    locked,
    ok: evaluation.can_lock,
    evaluation,
  };
}
