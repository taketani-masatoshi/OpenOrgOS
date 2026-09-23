/**
 * Monthly accounting close — one gate for CLI and Workbench.
 * Lock only when error-level gates pass.
 * A tenant with a cash balance, or an existing bank file, must import that month's statements.
 * A tenant with neither may skip the bank gates.
 * An existing unreadable or empty bank file blocks close.
 * Monthly-plan reconciliation is advisory and never blocks the ledger close.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { runValidateReport } from "../../commands/validate.js";
import { loadChartOfAccounts, loadMonthlyFinances, loadPayroll } from "../data.js";
import { getDataDir } from "../utils.js";
import { evaluateIndirectTaxClose } from "./indirect-tax/port.js";
import { resolveCloseAdjustmentAmountFromCoa } from "./close-adjustments.js";
import { buildDepreciationSchedule, postDepreciationJournalEntries } from "./depreciation.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import {
  lastDayOfMonth,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "./fiscal-year.js";
import { postMonthlyPlJournalEntries, postPayrollJournalEntry } from "./journal-sources.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import { buildBalanceSheet } from "./ledger/balance-sheet.js";
import { buildMonthlyReconcileReport } from "./ledger/monthly-reconcile.js";
import { subsidiaryLedgerIntegrityIssues } from "./ledger/subsidiary-ledger.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { computePayrollMonth } from "./payroll-jp.js";
import { isMonthLocked, latestLockForMonth, lockMonth } from "./period-lock.js";
import type { PeriodLockEvidence } from "../../../schemas/finance/period-lock.js";
import {
  abortMonthlyClosePosts,
  beginMonthlyCloseTransaction,
  defaultCloseAbortOccurredAt,
  isClosePostAborted,
  journalIdsCreatedSince,
  markMonthlyCloseAborted,
  markMonthlyCloseCommitted,
  markMonthlyClosePosted,
} from "./monthly-close-transaction.js";
import {
  bankFileExists,
  bankRowsForMonth,
  cashBalanceYen,
  cashJournalNet,
  isFirstFiscalMonth,
  monthBankTieOut,
  monthCashGlDelta,
  openingCashInWindow,
  previousMonth,
  tenantUsesBank,
  tieOutFromExclusive,
  unmatchedBankCountForMonth,
  type MonthBankTieOut,
} from "./monthly-close-bank.js";

export {
  monthBankTieOut,
  monthCashGlDelta,
  unmatchedBankCountForMonth,
  type MonthBankTieOut,
} from "./monthly-close-bank.js";

export {
  type CashbookExampleRow,
  scoreCashbookExample,
} from "./ledger/cashbook-display.js";

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
      !isClosePostAborted(entry.entry_id) &&
      !entry.reversal_of &&
      (entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
        (entry.source?.kind === "closing" &&
          entry.source.period === month &&
          entry.source.adjustment_id.startsWith("monthly-pl-"))),
  );
}

function depreciationPosted(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      !isClosePostAborted(entry.entry_id) &&
      !entry.reversal_of &&
      entry.source?.kind === "depreciation" &&
      entry.source.period === month,
  );
}

function payrollPosted(month: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      entry.entry_id === `JE-PAYROLL-${month}` &&
      !isClosePostAborted(entry.entry_id) &&
      !entry.reversal_of,
  );
}


function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function monthlyJournalSnapshotHash(month: string): string {
  return sha256(
    loadJournalEntries().entries.filter(
      (entry) =>
        entry.occurred_at.startsWith(month) &&
        !(entry.source?.kind === "closing" && entry.source.adjustment_id === "pl-transfer"),
    ),
  );
}

export function buildMonthlyCloseEvidence(
  evaluation: MonthlyCloseEvaluation,
  operatorId: string,
): PeriodLockEvidence {
  if (!evaluation.can_lock) {
    throw new Error(`Cannot capture close evidence for ${evaluation.month}: close gates failed`);
  }
  const trial = buildTrialBalance({ asOf: evaluation.as_of });
  const gateResults = evaluation.items.map(({ id, pass, level, detail }) => ({
    id,
    pass,
    level,
    ...(detail ? { detail } : {}),
  }));
  return {
    version: 1,
    algorithm: "sha256",
    journal_entries_sha256: monthlyJournalSnapshotHash(evaluation.month),
    bank_reconciliation_sha256: sha256(bankEvidenceSnapshot(evaluation.month, operatorId)),
    trial_balance_sha256: sha256(trial),
    gate_results_sha256: sha256(gateResults),
    operator_id: operatorId,
    can_lock: true,
    gate_results: gateResults,
  };
}

export function evaluateInventoryCloseGate(month: string, asOf: string): MonthlyCloseGate {
  const path = join(getDataDir(), "finance", "inventory.yaml");
  if (!existsSync(path)) {
    return gate("inventory-cogs", "棚卸と売上原価", true, "skip", "no inventory");
  }
  let months: Array<{
    month?: string;
    account_code?: string;
    ending_inventory_yen?: number;
    cogs_account_code?: string;
    cogs_yen?: number;
  }> = [];
  try {
    const raw = YAML.parse(readFileSync(path, "utf-8")) as {
      months?: typeof months;
    };
    months = raw?.months ?? [];
  } catch (error) {
    return gate(
      "inventory-cogs",
      "棚卸と売上原価",
      false,
      "error",
      error instanceof Error ? error.message : "inventory unreadable",
    );
  }
  const row = months.find((item) => item.month === month);
  if (!row?.account_code || row.ending_inventory_yen == null) {
    return gate("inventory-cogs", "棚卸と売上原価", false, "error", "inventory count missing");
  }
  const trial = buildTrialBalance({ asOf });
  const inventory =
    trial.rows.find((item) => item.account_code === row.account_code)?.balance_yen ?? 0;
  if (inventory !== row.ending_inventory_yen) {
    return gate(
      "inventory-cogs",
      "棚卸と売上原価",
      false,
      "error",
      `inventory ${inventory} != ${row.ending_inventory_yen}`,
    );
  }
  if (row.cogs_account_code && row.cogs_yen != null) {
    const cogs = Math.abs(
      trial.rows.find((item) => item.account_code === row.cogs_account_code)?.balance_yen ?? 0,
    );
    if (cogs !== row.cogs_yen) {
      return gate(
        "inventory-cogs",
        "棚卸と売上原価",
        false,
        "error",
        `cogs ${cogs} != ${row.cogs_yen}`,
      );
    }
  }
  return gate("inventory-cogs", "棚卸と売上原価", true, "error", "ok");
}


function bankEvidenceSnapshot(month: string, operatorId: string): {
  state: number | "missing" | "unreadable";
  unmatched: number | null;
  gl_delta: number | null;
  bank_net: number | null;
  operator_id: string;
} {
  const rows = bankRowsForMonth(month);
  const tie = monthBankTieOut(month);
  return {
    state: rows,
    unmatched:
      typeof rows === "number" && rows > 0 ? unmatchedBankCountForMonth(month) : null,
    gl_delta: tie.glDelta,
    bank_net: tie.bankNet,
    operator_id: operatorId,
  };
}

function pushBankGates(items: MonthlyCloseGate[], month: string): void {
  const rows = bankRowsForMonth(month);
  if (!tenantUsesBank()) {
    items.push(gate("bank-imported", "銀行明細を取込済み", true, "skip", "no bank"));
    items.push(gate("bank-unmatched", "銀行明細の未消込なし", true, "skip", "no bank"));
    items.push(gate("bank-gl-tieout", "銀行残高と総勘定が一致", true, "skip", "no bank"));
    return;
  }
  if (rows === "missing" || rows === "unreadable" || rows === 0) {
    const detail =
      rows === "missing"
        ? "no bank file"
        : rows === "unreadable"
          ? "bank statements unreadable"
          : "no bank rows for month";
    items.push(gate("bank-imported", "銀行明細を取込済み", false, "error", detail));
    items.push(gate("bank-unmatched", "銀行明細の未消込なし", false, "error", detail));
    items.push(gate("bank-gl-tieout", "銀行残高と総勘定が一致", false, "error", detail));
    return;
  }
  items.push(gate("bank-imported", "銀行明細を取込済み", true, "error", "ok"));
  const unmatched = unmatchedBankCountForMonth(month) ?? 0;
  items.push(
    gate(
      "bank-unmatched",
      "銀行明細の未消込なし",
      unmatched === 0,
      "error",
      unmatched === 0 ? "ok" : `${unmatched} unmatched`,
    ),
  );
  const tie = monthBankTieOut(month);
  items.push(
    gate("bank-gl-tieout", "銀行残高と総勘定が一致", tie.pass, "error", tie.detail),
  );
}

function priorEvidenceGate(month: string): MonthlyCloseGate {
  if (isFirstFiscalMonth(month)) {
    return gate("prior-evidence", "直前月の銀行と試算表", true, "skip", "first fiscal month");
  }
  const previous = previousMonth(month);
  const latest = latestLockForMonth(previous);
  if (latest?.status !== "locked" || !latest.evidence?.operator_id) {
    return gate(
      "prior-evidence",
      "直前月の銀行と試算表",
      true,
      "skip",
      "no prior close evidence",
    );
  }
  const bankHash = sha256(bankEvidenceSnapshot(previous, latest.evidence.operator_id));
  const trialHash = sha256(buildTrialBalance({ asOf: lastDayOfMonth(previous) }));
  const bankOk = bankHash === latest.evidence.bank_reconciliation_sha256;
  const trialOk = trialHash === latest.evidence.trial_balance_sha256;
  if (!bankOk || !trialOk) {
    return gate(
      "prior-evidence",
      "直前月の銀行と試算表",
      false,
      "error",
      "prior bank or trial balance changed",
    );
  }
  return gate("prior-evidence", "直前月の銀行と試算表", true, "error", "ok");
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

  const fromExclusive = tieOutFromExclusive(month);
  const priorCash = cashBalanceYen(fromExclusive);
  const endingCash = cashBalanceYen(asOf);
  const movement = cashJournalNet(fromExclusive, asOf) + openingCashInWindow(fromExclusive, asOf);
  const cashTied = endingCash === priorCash + movement;
  items.push(
    gate(
      "cash-ending",
      "期末現金が前月末と窓の増減に一致",
      cashTied,
      "error",
      cashTied ? "ok" : `ending cash ${endingCash} != prior ${priorCash} + movement ${movement}`,
    ),
  );

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

  // Always re-validate live finance data. Callers must not inject a report.
  const validate = runValidateReport({ warnings: true });
  const validateErrors = validate.issues
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

function postCloseAdjustments(month: string): string[] {
  const coa = loadChartOfAccounts();
  const posted: string[] = [];
  const asOf = lastDayOfMonth(month);
  for (const adjustment of coa.monthly_close_adjustments ?? []) {
    const amount = resolveCloseAdjustmentAmountFromCoa(adjustment.amount_source, month);
    if (amount <= 0) continue;
    const entryId = `JE-CLOSE-${month}-${adjustment.trigger}`.toUpperCase();
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
 * Atomic monthly close: preflight → post → postflight → lock.
 * Failed postflight aborts only journals created in this attempt.
 * A month that is already locked is not posted into and is not unlocked.
 */
export function closeAccountingMonth(input: {
  month: string;
  operatorId: string;
  postDepreciation?: boolean;
  postPayroll?: boolean;
}): MonthlyCloseResult {
  monthKey(input.month);
  if (isMonthLocked(input.month)) {
    const evaluation = evaluateMonthlyCloseGates(input.month, {
      requireDepreciation: input.postDepreciation,
      requirePayroll: input.postPayroll,
    });
    const exclusive = gate(
      "month-exclusive",
      "同じ月の再締めを拒否",
      false,
      "error",
      "already locked",
    );
    return {
      month: input.month,
      posted_entry_ids: [],
      locked: true,
      ok: false,
      evaluation: {
        ...evaluation,
        can_lock: false,
        items: [...evaluation.items, exclusive],
        errors: [...evaluation.errors, "month-exclusive: already locked"],
      },
    };
  }

  const gateOpts = {
    requireDepreciation: input.postDepreciation,
    requirePayroll: input.postPayroll,
  } as const;

  const preflight = evaluateMonthlyCloseGates(input.month, {
    ...gateOpts,
    phase: "preflight",
  });
  if (!preflight.can_lock) {
    return {
      month: input.month,
      posted_entry_ids: [],
      locked: false,
      ok: false,
      evaluation: preflight,
    };
  }

  let state = beginMonthlyCloseTransaction({
    month: input.month,
    operatorId: input.operatorId,
  });

  // Resume after crash: journals posted, lock missing.
  if (state.phase === "posted" && state.posted_entry_ids.length > 0) {
    const evaluation = evaluateMonthlyCloseGates(input.month, gateOpts);
    if (evaluation.can_lock) {
      lockMonth({
        month: input.month,
        lockedBy: input.operatorId,
        reason: "finances close",
        evidence: buildMonthlyCloseEvidence(evaluation, input.operatorId),
      });
      markMonthlyCloseCommitted(state);
      return {
        month: input.month,
        posted_entry_ids: state.posted_entry_ids,
        locked: true,
        ok: true,
        evaluation,
      };
    }
    const abortIds = abortMonthlyClosePosts({
      entryIds: state.posted_entry_ids,
      operatorId: input.operatorId,
      occurredAt: defaultCloseAbortOccurredAt(input.month),
    });
    markMonthlyCloseAborted(state, abortIds);
    return {
      month: input.month,
      posted_entry_ids: [],
      locked: false,
      ok: false,
      evaluation,
    };
  }

  const beforeIds = new Set(loadJournalEntries().entries.map((entry) => entry.entry_id));
  postMonthJournals(input.month, input.operatorId, {
    postDepreciation: input.postDepreciation,
    postPayroll: input.postPayroll,
  });
  const newlyCreated = journalIdsCreatedSince(beforeIds);
  state = markMonthlyClosePosted(state, newlyCreated);

  const evaluation = evaluateMonthlyCloseGates(input.month, gateOpts);
  if (!evaluation.can_lock) {
    const abortIds = abortMonthlyClosePosts({
      entryIds: newlyCreated,
      operatorId: input.operatorId,
      occurredAt: defaultCloseAbortOccurredAt(input.month),
    });
    markMonthlyCloseAborted(state, abortIds);
    return {
      month: input.month,
      posted_entry_ids: [],
      locked: false,
      ok: false,
      evaluation,
    };
  }

  lockMonth({
    month: input.month,
    lockedBy: input.operatorId,
    reason: "finances close",
    evidence: buildMonthlyCloseEvidence(evaluation, input.operatorId),
  });
  markMonthlyCloseCommitted(state);
  return {
    month: input.month,
    posted_entry_ids: newlyCreated,
    locked: true,
    ok: true,
    evaluation,
  };
}
