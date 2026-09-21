/**
 * Monthly accounting close — one gate for CLI and Workbench.
 * Lock only when error-level gates pass.
 * A missing bank file is skipped only when the tenant has no configured bank account.
 * Monthly-plan reconciliation is advisory and never blocks the ledger close.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { runValidateReport } from "../../commands/validate.js";
import type { ValidateReport } from "../../commands/validate.js";
import { loadChartOfAccounts, loadMonthlyFinances, loadPayroll } from "../data.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { buildConsumptionTaxSummary, runConsumptionTaxCheck } from "./consumption-tax.js";
import { resolveCloseAdjustmentAmountFromCoa } from "./close-adjustments.js";
import { buildDepreciationSchedule, postDepreciationJournalEntries } from "./depreciation.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearStartMonth,
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
import type { PeriodLockEvidence } from "../../../schemas/finance/period-lock.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { bankControlIntegrityIssuesAt } from "./ledger/control-reconcile.js";

const SKIP_MPL_EXPENSE = new Set(["depreciation", "loan_payment", "capex"]);

const monthlyCloseTransactionSchema = z.object({
  version: z.literal(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  operator_id: z.string().min(1),
  phase: z.enum(["prepared", "posting", "validating", "locked"]),
  posted_entry_ids: z.array(z.string()),
  lease_expires_at: z.string().datetime().optional(),
  updated_at: z.string().datetime(),
});
type MonthlyCloseTransaction = z.output<typeof monthlyCloseTransactionSchema>;
const MONTHLY_CLOSE_LEASE_MS = 15 * 60_000;

function leaseExpiry(now: string): string {
  return new Date(new Date(now).getTime() + MONTHLY_CLOSE_LEASE_MS).toISOString();
}

function postedEntryIdsForMonth(month: string): string[] {
  return loadJournalEntries().entries.filter((entry) =>
    entry.occurred_at.startsWith(month) && (
      entry.entry_id === `JE-PAYROLL-${month}` ||
      entry.entry_id.startsWith(`JE-MPL-${month}-`) ||
      entry.source?.kind === "depreciation" ||
      entry.source?.kind === "closing"
    )
  ).map((entry) => entry.entry_id);
}

export function monthlyCloseTransactionPath(month: string): string {
  return join(getDataDir(), "finance", `monthly-close.${month}.yaml`);
}

function loadMonthlyCloseTransaction(month: string): MonthlyCloseTransaction | null {
  try { return readYamlFile(monthlyCloseTransactionPath(month), monthlyCloseTransactionSchema); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function saveMonthlyCloseTransaction(state: MonthlyCloseTransaction): void {
  writeYamlFileAtomic(monthlyCloseTransactionPath(state.month), monthlyCloseTransactionSchema.parse(state));
}

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
    (entry) => entry.source?.kind === "depreciation" && entry.source.period === month,
  );
}

function payrollPosted(month: string): boolean {
  return loadJournalEntries().entries.some((entry) => entry.entry_id === `JE-PAYROLL-${month}`);
}

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year!, monthNumber! - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isFirstFiscalMonth(month: string): boolean {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear = resolveFiscalYear(endMonth, month);
  return fiscalYearStartMonth(fiscalYear, endMonth) === month;
}

function bankRowsForMonth(month: string): number | "missing" | "unreadable" {
  if (!bankFileExists()) return "missing";
  const lite = loadBankStatementsLite();
  if (!lite) return "unreadable";
  return lite.entries.filter((row) => row.date.slice(0, 7) === month).length;
}

function tenantUsesBanking(): boolean {
  if (bankFileExists()) return true;
  const cashPath = join(getDataDir(), "finance", "cash-balance.yaml");
  if (!existsSync(cashPath)) return false;
  try {
    const raw = YAML.parse(readFileSync(cashPath, "utf8")) as {
      accounts?: Array<{ bank_account_id?: unknown }>;
    };
    return Boolean(raw.accounts?.some((account) => typeof account.bank_account_id === "string"));
  } catch {
    // Invalid bank configuration must not silently downgrade reconciliation to skip.
    return true;
  }
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

export function monthlyBankReconciliationSnapshotHash(month: string): string {
  const rows = bankRowsForMonth(month);
  let entries: unknown[] = [];
  if (bankFileExists()) {
    const raw = YAML.parse(readFileSync(join(getDataDir(), "finance", "bank-statements.yaml"), "utf8")) as { entries?: Array<Record<string, unknown>> };
    entries = (raw.entries ?? [])
      .filter((row) => typeof row.date === "string" && row.date.slice(0, 7) === month)
      .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  }
  return sha256({
    state: rows,
    entries,
    unmatched:
      typeof rows === "number" && rows > 0 ? unmatchedBankCountForMonth(month) : null,
  });
}

export function monthlyTrialBalanceSnapshotHash(month: string): string {
  return sha256(buildTrialBalance({
    asOf: lastDayOfMonth(month),
    excludeAnnualPlTransfer: true,
  }));
}

export function buildMonthlyCloseEvidence(evaluation: MonthlyCloseEvaluation): PeriodLockEvidence {
  if (!evaluation.can_lock) {
    throw new Error(`Cannot capture close evidence for ${evaluation.month}: close gates failed`);
  }
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
    bank_reconciliation_sha256: monthlyBankReconciliationSnapshotHash(evaluation.month),
    trial_balance_sha256: monthlyTrialBalanceSnapshotHash(evaluation.month),
    gate_results_sha256: sha256(gateResults),
    can_lock: true,
    gate_results: gateResults,
  };
}

function missingTaxCategories(month: string): string[] {
  const types = new Map(
    loadChartOfAccounts().accounts.map((account) => [account.code, account.type]),
  );
  const missing: string[] = [];
  for (const entry of loadJournalEntries().entries) {
    if (!entry.occurred_at.startsWith(month)) continue;
    for (const line of entry.lines) {
      const type = types.get(line.account_code);
      if (type !== "revenue" && type !== "expense") continue;
      if (!line.tax_category) {
        missing.push(`${entry.entry_id}:${line.account_code}`);
      }
    }
  }
  return missing;
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

function bankFileExists(): boolean {
  return existsSync(join(getDataDir(), "finance", "bank-statements.yaml"));
}

/** Unmatched bank rows in the close month. null = no bank file. */
export function unmatchedBankCountForMonth(month: string): number | null {
  if (!bankFileExists()) return null;
  const lite = loadBankStatementsLite();
  if (!lite) return Number.POSITIVE_INFINITY;
  return lite.entries.filter(
    (row) => row.date.slice(0, 7) === month && (!row.status || row.status === "unmatched"),
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
  opts?: {
    requireDepreciation?: boolean;
    requirePayroll?: boolean;
    validateReport?: ValidateReport;
  },
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

  if (!isFirstFiscalMonth(month) && !isMonthLocked(previousMonth(month))) {
    items.push(
      gate(
        "prior-month-locked",
        "直前の月がロック済み",
        false,
        "error",
        `${previousMonth(month)} unlocked`,
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

  const fiscalYear = resolveFiscalYear(resolveCompanyFiscalYearEndMonth(), month);
  const balanceSheet = buildBalanceSheet({ asOf, fiscalYear });
  const bsPass =
    balanceSheet.balanced &&
    !balanceSheet.issues.some((issue) => issue.includes("missing bs_class"));
  items.push(
    gate(
      "balance-sheet",
      "貸借対照表が一致",
      bsPass,
      "error",
      bsPass ? "balanced" : balanceSheet.issues.join("; ") || "unbalanced",
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

  const rows = bankRowsForMonth(month);
  if (rows === "missing") {
    const required = tenantUsesBanking();
    const detail = required
      ? "configured bank account has no statement file"
      : "tenant has no configured bank account";
    items.push(
      gate("bank-imported", "銀行明細を取込済み", !required, required ? "error" : "skip", detail),
    );
    items.push(
      gate("bank-unmatched", "銀行明細の未消込なし", !required, required ? "error" : "skip", detail),
    );
  } else if (rows === 0) {
    items.push(
      gate("bank-imported", "銀行明細を取込済み", false, "error", "no bank rows for month"),
    );
    items.push(
      gate("bank-unmatched", "銀行明細の未消込なし", false, "error", "no bank rows for month"),
    );
  } else if (rows === "unreadable") {
    items.push(
      gate("bank-imported", "銀行明細を取込済み", false, "error", "bank statements unreadable"),
    );
    items.push(
      gate("bank-unmatched", "銀行明細の未消込なし", false, "error", "bank statements unreadable"),
    );
  } else {
    const unmatched = unmatchedBankCountForMonth(month);
    items.push(gate("bank-imported", "銀行明細を取込済み", true, "error", "ok"));
    items.push(
      gate(
        "bank-unmatched",
        "銀行明細の未消込なし",
        unmatched === 0,
        "error",
        `${unmatched} unmatched`,
      ),
    );
  }

  const bankControlIssues = tenantUsesBanking() ? bankControlIntegrityIssuesAt(asOf) : [];
  const bankControlErrors = bankControlIssues.filter((issue) => issue.level === "error");
  const bankingRequired = tenantUsesBanking();
  items.push(
    rows === "missing"
      ? gate(
          "bank-gl-tieout",
          "銀行明細と総勘定元帳が一致",
          !bankingRequired,
          bankingRequired ? "error" : "skip",
          "no bank statements",
        )
      : gate(
          "bank-gl-tieout",
          "銀行明細と総勘定元帳が一致",
          bankControlErrors.length === 0,
          "error",
          bankControlIssues.map((issue) => issue.message).join("; ") || "tied out",
        ),
  );

  items.push(evaluateInventoryCloseGate(month, asOf));

  const missingTax = missingTaxCategories(month);
  let taxDetail = "ok";
  let taxPass = missingTax.length === 0;
  if (!taxPass) taxDetail = `missing tax_category ${missingTax.join(", ")}`;
  try {
    const summary = buildConsumptionTaxSummary({ period: month });
    const failures = [
      ...(summary.issues ?? []).filter((issue) => issue.severity === "error"),
      ...runConsumptionTaxCheck().issues.filter((issue) => issue.severity === "blocking"),
    ];
    if (failures.length > 0) {
      taxPass = false;
      taxDetail = failures.map((issue) => issue.message).join("; ");
    }
  } catch (error) {
    taxPass = false;
    taxDetail = error instanceof Error ? error.message : String(error);
  }
  items.push(gate("consumption-tax", "消費税集計", taxPass, "error", taxDetail));

  const validate = opts?.validateReport ?? runValidateReport({ warnings: true });
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
 * Post month-end journals, then lock only if error gates pass.
 * A month that is already locked is not posted into and is not unlocked.
 */
export function closeAccountingMonth(input: {
  month: string;
  operatorId: string;
  postDepreciation?: boolean;
  postPayroll?: boolean;
  validateReport?: ValidateReport;
}): MonthlyCloseResult {
  monthKey(input.month);
  return withYamlFileLock(
    join(getDataDir(), "finance", ".accounting-close"),
    () => {
      const existing = loadMonthlyCloseTransaction(input.month);
      const now = new Date().toISOString();
      const leaseActive = existing?.lease_expires_at ? existing.lease_expires_at > now : Boolean(existing);
      if (existing && existing.operator_id !== input.operatorId && existing.phase !== "locked" && leaseActive) {
        throw new Error(`monthly close ${input.month} is owned by ${existing.operator_id}`);
      }
      let transaction: MonthlyCloseTransaction = existing ? {
        ...existing,
        operator_id: existing.phase === "locked" ? existing.operator_id : input.operatorId,
        posted_entry_ids: [...new Set([...existing.posted_entry_ids, ...postedEntryIdsForMonth(input.month)])],
        lease_expires_at: existing.phase === "locked" ? existing.lease_expires_at : leaseExpiry(now),
        updated_at: now,
      } : {
        version: 1, month: input.month, operator_id: input.operatorId,
        phase: "prepared", posted_entry_ids: postedEntryIdsForMonth(input.month), lease_expires_at: leaseExpiry(now), updated_at: now,
      };
      saveMonthlyCloseTransaction(transaction);
      transaction = { ...transaction, phase: "posting", lease_expires_at: leaseExpiry(new Date().toISOString()), updated_at: new Date().toISOString() };
      saveMonthlyCloseTransaction(transaction);
      const posted = isMonthLocked(input.month)
        ? []
        : postMonthJournals(input.month, input.operatorId, {
            postDepreciation: input.postDepreciation,
            postPayroll: input.postPayroll,
          });
      transaction = {
        ...transaction,
        phase: "validating",
        posted_entry_ids: [...new Set([...transaction.posted_entry_ids, ...posted, ...postedEntryIdsForMonth(input.month)])],
        lease_expires_at: leaseExpiry(new Date().toISOString()),
        updated_at: new Date().toISOString(),
      };
      saveMonthlyCloseTransaction(transaction);
      const evaluation = evaluateMonthlyCloseGates(input.month, {
        requireDepreciation: input.postDepreciation,
        requirePayroll: input.postPayroll,
        validateReport: input.validateReport,
      });
      let locked = isMonthLocked(input.month);
      if (evaluation.can_lock && !locked) {
        lockMonth({
          month: input.month,
          lockedBy: input.operatorId,
          reason: "finances close",
          evidence: buildMonthlyCloseEvidence(evaluation),
        });
        locked = true;
      }
      if (locked) {
        transaction = { ...transaction, phase: "locked", lease_expires_at: undefined, updated_at: new Date().toISOString() };
        saveMonthlyCloseTransaction(transaction);
      }
      return {
        month: input.month,
        posted_entry_ids: posted,
        locked,
        ok: evaluation.can_lock,
        evaluation,
      };
    },
    { retries: 120, retryDelayMs: 25 },
  );
}
