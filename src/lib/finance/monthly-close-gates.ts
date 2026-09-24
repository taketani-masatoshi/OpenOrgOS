/**
 * Monthly close gate evaluation (balances, bank, tax, validate).
 * Does not post journals or lock periods — orchestration stays in monthly-close.ts.
 */
import { runValidateReport } from "../../commands/validate.js";
import { loadMonthlyFinances, loadPayroll } from "../data.js";
import { evaluateIndirectTaxClose } from "./indirect-tax/port.js";
import { buildDepreciationSchedule } from "./depreciation.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  lastDayOfMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "./fiscal-year.js";
import { buildBalanceSheet } from "./ledger/balance-sheet.js";
import { buildMonthlyReconcileReport } from "./ledger/monthly-reconcile.js";
import { subsidiaryLedgerIntegrityIssues } from "./ledger/subsidiary-ledger.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { isMonthLocked } from "./period-lock.js";
import {
  buildCloseAbortIdSet,
  isClosePostAbortedInSet,
} from "./monthly-close-transaction.js";
import {
  cashBalanceYen,
  cashJournalNet,
  isFirstFiscalMonth,
  openingCashInWindow,
  previousMonth,
  tieOutFromExclusive,
} from "./monthly-close-bank.js";
import { evaluateInventoryCloseGate } from "./monthly-close-inventory.js";
import {
  bankEvidenceSnapshot,
  gate,
  priorEvidenceGate,
  pushBankGates,
} from "./monthly-close-gate-bank.js";

export { bankEvidenceSnapshot, gate } from "./monthly-close-gate-bank.js";

const SKIP_MPL_EXPENSE = new Set(["depreciation", "loan_payment", "capex", "payroll"]);

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
export function monthKey(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month YYYY-MM is required");
  }
}

export function payrollGross(): number {
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

type JournalRow = ReturnType<typeof loadJournalEntries>["entries"][number];

function sourcePeriod(entry: JournalRow): string | undefined {
  const source = entry.source;
  if (!source) return undefined;
  if ("period" in source && typeof source.period === "string") return source.period;
  return undefined;
}

function activeCloseEntries(month: string): { entries: JournalRow[]; aborted: Set<string> } {
  const entries = loadJournalEntries().entries;
  const aborted = buildCloseAbortIdSet(entries);
  return {
    entries: entries.filter(
      (entry) =>
        !entry.reversal_of &&
        !isClosePostAbortedInSet(entry.entry_id, aborted) &&
        (sourcePeriod(entry) === month ||
          entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
          entry.entry_id.startsWith(`JE-PAYROLL-${month}`)),
    ),
    aborted,
  };
}

function monthlyPlPosted(month: string): boolean {
  const { entries } = activeCloseEntries(month);
  return entries.some(
    (entry) =>
      entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
      (entry.source?.kind === "closing" &&
        entry.source.period === month &&
        entry.source.adjustment_id.startsWith("monthly-pl-")),
  );
}

function depreciationPosted(month: string): boolean {
  const { entries } = activeCloseEntries(month);
  return entries.some(
    (entry) => entry.source?.kind === "depreciation" && entry.source.period === month,
  );
}

function payrollPosted(month: string): boolean {
  const { entries } = activeCloseEntries(month);
  return entries.some(
    (entry) =>
      entry.source?.kind === "payroll" &&
      entry.source.period === month &&
      (entry.entry_id === `JE-PAYROLL-${month}` ||
        entry.entry_id.startsWith(`JE-PAYROLL-${month}-R`)),
  );
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
  opts?: {
    requireDepreciation?: boolean;
    requirePayroll?: boolean;
    /** preflight: skip post-required gates (close will post them next). */
    phase?: "preflight" | "full";
  },
): MonthlyCloseEvaluation {
  monthKey(month);
  const asOf = lastDayOfMonth(month);
  const items: MonthlyCloseGate[] = [];
  const phase = opts?.phase ?? "full";
  const requireDepreciation = opts?.requireDepreciation !== false;
  const requirePayroll = opts?.requirePayroll !== false;

  if (phase === "full") {
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
  } else {
    items.push(
      gate(
        "close-posts-deferred",
        "締め仕訳は後段で計上",
        true,
        "skip",
        "preflight defers depreciation/payroll/monthly-pl posts",
      ),
    );
  }

  if (!isFirstFiscalMonth(month) && !isMonthLocked(previousMonth(month))) {
    const prior = previousMonth(month);
    items.push(
      gate(
        "prior-month-locked",
        "直前の月がロック済み",
        false,
        "error",
        `${prior} unlocked — lock ${prior} before closing ${month}`,
      ),
    );
  } else {
    items.push(gate("prior-month-locked", "直前の月がロック済み", true, "error", "ok"));
  }

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

  try {
    const fromExclusive = tieOutFromExclusive(month);
    const priorCash = cashBalanceYen(fromExclusive);
    const endingCash = cashBalanceYen(asOf);
    const movement =
      cashJournalNet(fromExclusive, asOf) + openingCashInWindow(fromExclusive, asOf);
    const cashTied = endingCash === priorCash + movement;
    items.push(
      gate(
        "cash-ending",
        "期末現金が前月末と窓の増減に一致",
        cashTied,
        "error",
        cashTied
          ? "ok"
          : `ending cash ${endingCash} != prior ${priorCash} + movement ${movement}`,
      ),
    );
  } catch (error) {
    items.push(
      gate(
        "cash-ending",
        "期末現金が前月末と窓の増減に一致",
        false,
        "error",
        error instanceof Error ? error.message : String(error),
      ),
    );
  }

  const fiscalYear = resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), month);
  const balanceSheet = buildBalanceSheet({ asOf, fiscalYear });
  const missingBsClass = balanceSheet.issues.filter((issue) =>
    issue.includes("missing bs_class"),
  );
  const bsPass = balanceSheet.balanced && missingBsClass.length === 0;
  items.push(
    gate(
      "balance-sheet",
      "貸借対照表が一致",
      bsPass,
      "error",
      bsPass
        ? "balanced"
        : missingBsClass.length > 0
          ? `chart-of-accounts needs bs_class: ${missingBsClass.join("; ")}`
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

  pushBankGates(items, month);
  items.push(priorEvidenceGate(month));

  items.push(evaluateInventoryCloseGate(month, asOf));

  const indirectTax = evaluateIndirectTaxClose(month);
  // Non-JP / uninstalled engines must not look like a green JP close.
  const consumptionLevel =
    indirectTax.engine === "uninstalled" ? "skip" : ("error" as const);
  items.push(
    gate(
      "consumption-tax",
      indirectTax.label,
      indirectTax.pass,
      consumptionLevel,
      indirectTax.engine === "uninstalled"
        ? `${indirectTax.detail} (not a JP filing pass)`
        : indirectTax.detail,
    ),
  );

  // Validate is expensive (full tenant schema). Preflight skips it; acceptance may
  // defer it to a single post-year run via ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE=1.
  let validateErrors: string[] = [];
  const deferValidate = process.env.ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE === "1";
  if (phase === "full" && !deferValidate) {
    const validate = runValidateReport({ warnings: true });
    validateErrors = validate.issues
      .filter((issue) => issue.severity === "error" && issue.path.includes("data/finance/"))
      .map((issue) => `${issue.path}: ${issue.message}`);
    items.push(
      gate(
        "validate",
        "帳簿整合性チェック",
        validateErrors.length === 0,
        "error",
        validateErrors.length === 0 ? "ok" : `${validateErrors.length} errors`,
      ),
    );
  } else {
    items.push(
      gate(
        "validate",
        "帳簿整合性チェック",
        true,
        "skip",
        phase === "preflight"
          ? "preflight defers validate until after close posts"
          : "deferred by ORGOS_MONTHLY_CLOSE_DEFER_VALIDATE",
      ),
    );
  }

  const plan = loadMonthlyFinances().find((row) => row.month === month);
  const reconcile = buildMonthlyReconcileReport({ month });
  const reconcileDetail = !plan
    ? "monthly plan not imported"
    : reconcile.balanced
      ? "balanced"
      : reconcile.diffs.map((diff) => `${diff.category} delta ${diff.delta_yen}`).join("; ") ||
        "variance";
  items.push(
    gate(
      "monthly-reconcile",
      "月次YAML突合",
      Boolean(plan) && reconcile.balanced,
      "warning",
      reconcileDetail,
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

