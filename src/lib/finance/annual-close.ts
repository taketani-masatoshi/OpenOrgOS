/**
 * Annual accounting close.
 * Every month must be locked with immutable close evidence, and the statements,
 * tax worksheets, and year-end declarations must agree with the books.
 * A resumable transaction state makes partial multi-file commits safe to retry.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { OpeningBalancesFile } from "../../../schemas/finance/opening-balances.js";
import { openingBalancesSchema } from "../../../schemas/finance/opening-balances.js";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  nextFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "./fiscal-year.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";
import {
  buildOpeningBalancesFromTrialBalance,
  openingBalancesPath,
} from "./ledger/opening-balance.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { equityChangeAmounts, buildIndividualNotesReport } from "./ledger/balance-sheet.js";
import { monthlyJournalSnapshotHash } from "./monthly-close.js";
import { latestLockForMonth } from "./period-lock.js";
import { evaluateTaxAdjustment } from "./tax-adjustment.js";
import { isSoleProprietorship } from "./sole-prop-entity.js";
import { evaluateYearEndDeclaration } from "./year-end-declaration.js";

export type AnnualCloseMonthGate = {
  month: string;
  locked: boolean;
  can_lock: boolean;
};

export type AnnualCloseEvaluation = {
  fiscal_year: string;
  as_of: string;
  next_fiscal_year: string;
  next_period_start: string;
  months: AnnualCloseMonthGate[];
  can_close: boolean;
  errors: string[];
};

export type AnnualCloseResult = {
  ok: boolean;
  posted_entry_ids: string[];
  opening_proposal_path: string | null;
  evaluation: AnnualCloseEvaluation;
};

const annualCloseTransactionSchema = z.object({
  version: z.literal(1),
  transaction_id: z.string().min(1),
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  operator_id: z.string().min(1),
  phase: z.enum(["prepared", "validated", "committing", "committed"]),
  evidence_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  transfer_entry_id: z.string().min(1),
  proposal_path: z.string().min(1),
  opening_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
type AnnualCloseTransaction = z.output<typeof annualCloseTransactionSchema>;

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

export function annualCloseTransactionPath(fiscalYear: string): string {
  assertFiscalYear(fiscalYear);
  return join(getDataDir(), "finance", `annual-close.${fiscalYear}.state.yaml`);
}

function saveTransaction(state: AnnualCloseTransaction): void {
  writeYamlFileAtomic(
    annualCloseTransactionPath(state.fiscal_year),
    annualCloseTransactionSchema.parse(state),
  );
}

function assertFiscalYear(fiscalYear: string): void {
  if (!/^FY\d{4}$/.test(fiscalYear)) {
    throw new Error("fiscal year FY#### is required");
  }
}

export function listFiscalYearMonths(fiscalYear: string, fiscalYearEndMonth: number): string[] {
  const end = fiscalYearEndDate(fiscalYear, fiscalYearEndMonth).slice(0, 7);
  const months: string[] = [];
  let cursor = fiscalYearStartMonth(fiscalYear, fiscalYearEndMonth);
  for (let guard = 0; guard < 24; guard += 1) {
    months.push(cursor);
    if (cursor === end) return months;
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(year!, month!, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
  throw new Error(`Could not enumerate fiscal year ${fiscalYear}`);
}

export function proposedOpeningBalancesPath(nextFiscalYearId: string): string {
  return join(getDataDir(), "finance", `opening-balances.${nextFiscalYearId}.yaml`);
}

export function evaluateAnnualCloseGates(fiscalYear: string): AnnualCloseEvaluation {
  assertFiscalYear(fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  const next = nextFiscalYear(fiscalYear);
  const months = listFiscalYearMonths(fiscalYear, endMonth);
  const errors: string[] = [];
  const monthGates: AnnualCloseMonthGate[] = [];
  for (const month of months) {
    const lock = latestLockForMonth(month);
    const locked = lock?.status === "locked";
    if (!locked) errors.push(`${month}: unlocked`);
    const evidence = locked ? lock?.evidence : undefined;
    let evidenceValid = Boolean(evidence?.can_lock);
    if (locked && !evidence) {
      errors.push(`${month}: close evidence missing; unlock and close the month again`);
    } else if (evidence) {
      if (sha256(evidence.gate_results) !== evidence.gate_results_sha256) {
        evidenceValid = false;
        errors.push(`${month}: close gate evidence hash mismatch`);
      }
      if (monthlyJournalSnapshotHash(month) !== evidence.journal_entries_sha256) {
        evidenceValid = false;
        errors.push(`${month}: journal snapshot changed after period lock`);
      }
    }
    monthGates.push({ month, locked, can_lock: evidenceValid });
  }
  errors.push(...evaluateYearEndDeclaration(fiscalYear).errors);
  const equity = equityChangeAmounts({ asOf, fiscalYear });
  if (!equity.balanced) {
    errors.push(...(equity.issues.length > 0 ? equity.issues : ["equity change unbalanced"]));
  }
  const notes = buildIndividualNotesReport({ asOf, fiscalYear });
  if (!notes.ready) errors.push(...notes.errors);
  if (!isSoleProprietorship()) {
    const tax = evaluateTaxAdjustment(fiscalYear);
    if (!tax.can_compute) {
      errors.push(...tax.errors.map((issue) => `tax-adjustment: ${issue}`));
    }
  }
  return {
    fiscal_year: fiscalYear,
    as_of: asOf,
    next_fiscal_year: next,
    next_period_start: fiscalYearStartMonth(next, endMonth),
    months: monthGates,
    can_close: errors.length === 0,
    errors,
  };
}

export function postAnnualPlTransfer(input: { fiscalYear: string; asOf: string }): string | null {
  const coa = loadChartOfAccounts();
  const accounts = resolveJournalSourceAccounts(coa);
  const trial = buildTrialBalance({ asOf: input.asOf });
  const lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: "out_of_scope";
  }> = [];
  let revenueTotal = 0;
  let expenseTotal = 0;

  for (const row of trial.rows) {
    const account = coa.accounts.find((item) => item.code === row.account_code);
    if (!account || row.balance_yen === 0) continue;
    if (account.type === "revenue") {
      const amount = Math.abs(row.balance_yen);
      revenueTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (account.type === "expense") {
      const amount = Math.abs(row.balance_yen);
      expenseTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      });
    }
  }

  const netToEquity = revenueTotal - expenseTotal;
  const equityAccount = accounts.owner_capital ?? accounts.retained_earnings;
  if (netToEquity > 0) {
    lines.push({
      account_code: equityAccount,
      debit_yen: 0,
      credit_yen: netToEquity,
      tax_category: "out_of_scope",
    });
  } else if (netToEquity < 0) {
    lines.push({
      account_code: equityAccount,
      debit_yen: -netToEquity,
      credit_yen: 0,
      tax_category: "out_of_scope",
    });
  }
  if (lines.length < 2) return null;

  const entryId = `JE-CLOSE-${input.fiscalYear}-PL-TRANSFER`;
  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: `${input.asOf}T23:59:59.000Z`,
      description: `Annual P/L transfer ${input.fiscalYear}`,
      source: {
        kind: "closing",
        period: input.asOf.slice(0, 7),
        adjustment_id: "pl-transfer",
      },
      evidence_refs: [`annual-close:${input.fiscalYear}`],
      lines,
    },
    { allowAnnualPlTransfer: true },
  );
  return entryId;
}

function writeOpeningProposal(file: OpeningBalancesFile, nextFiscalYearId: string): string {
  const path = proposedOpeningBalancesPath(nextFiscalYearId);
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFileAtomic(path, openingBalancesSchema.parse(file));
  return path;
}

/**
 * Post the P/L transfer and switch the live opening file only when every gate passes.
 * A failed close leaves journals and the live opening file unchanged.
 */
function closeAccountingYearUnlocked(input: {
  fiscalYear: string;
  operatorId: string;
}): AnnualCloseResult {
  assertFiscalYear(input.fiscalYear);
  const evaluation = evaluateAnnualCloseGates(input.fiscalYear);
  const transactionPath = annualCloseTransactionPath(input.fiscalYear);
  const existing = (() => {
    try {
      return readYamlFile(transactionPath, annualCloseTransactionSchema);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  })();
  // After a successful close the live opening belongs to the next year, so
  // statement/tax gates for this FY may fail. Resume from the committed state.
  if (existing?.phase === "committed") {
    const expected = existing.opening_sha256;
    const proposal = readYamlFile(existing.proposal_path, openingBalancesSchema);
    const live = readYamlFile(openingBalancesPath(), openingBalancesSchema);
    if (!expected || sha256(proposal) !== expected || sha256(live) !== expected) {
      throw new Error(`Annual close ${input.fiscalYear} committed artifacts changed`);
    }
    return {
      ok: true,
      posted_entry_ids: [],
      opening_proposal_path: existing.proposal_path,
      evaluation,
    };
  }
  if (!evaluation.can_close) {
    return {
      ok: false,
      posted_entry_ids: [],
      opening_proposal_path: null,
      evaluation,
    };
  }
  const lockEvidence = evaluation.months.map((row) => {
    const lock = latestLockForMonth(row.month);
    return { month: row.month, at: lock?.at, evidence: lock?.evidence };
  });
  const evidenceHash = sha256(lockEvidence);
  if (existing && existing.evidence_sha256 !== evidenceHash) {
    throw new Error(`Annual close ${input.fiscalYear} evidence changed after prepare`);
  }
  const now = new Date().toISOString();
  let transaction: AnnualCloseTransaction = existing ?? {
    version: 1,
    transaction_id: randomUUID(),
    fiscal_year: input.fiscalYear,
    operator_id: input.operatorId,
    phase: "prepared",
    evidence_sha256: evidenceHash,
    transfer_entry_id: `JE-CLOSE-${input.fiscalYear}-PL-TRANSFER`,
    proposal_path: proposedOpeningBalancesPath(evaluation.next_fiscal_year),
    created_at: now,
    updated_at: now,
  };
  if (!existing) saveTransaction(transaction);
  if (transaction.phase === "prepared") {
    transaction = {
      ...transaction,
      phase: "validated",
      updated_at: new Date().toISOString(),
    };
    saveTransaction(transaction);
  }
  if (transaction.phase !== "committed") {
    transaction = {
      ...transaction,
      phase: "committing",
      updated_at: new Date().toISOString(),
    };
    saveTransaction(transaction);
  }
  const before = new Set(loadJournalEntries().entries.map((entry) => entry.entry_id));
  const transferId = postAnnualPlTransfer({
    fiscalYear: input.fiscalYear,
    asOf: evaluation.as_of,
  });
  const posted = transferId && !before.has(transferId) ? [transferId] : [];
  const opening = buildOpeningBalancesFromTrialBalance({
    fiscalYear: evaluation.next_fiscal_year,
    asOf: evaluation.as_of,
    periodStart: evaluation.next_period_start,
    bsOnly: true,
    notes: `Opened by annual close ${input.fiscalYear} · authorized_by ${input.operatorId}`,
  });
  const proposalPath = writeOpeningProposal(opening, evaluation.next_fiscal_year);
  const parsedOpening = openingBalancesSchema.parse(opening);
  const openingHash = sha256(parsedOpening);
  writeYamlFileAtomic(openingBalancesPath(), parsedOpening);
  transaction = {
    ...transaction,
    phase: "committed",
    opening_sha256: openingHash,
    updated_at: new Date().toISOString(),
  };
  saveTransaction(transaction);
  return {
    ok: true,
    posted_entry_ids: posted,
    opening_proposal_path: proposalPath,
    evaluation,
  };
}

/** Serialize the whole prepare → validate → commit sequence per fiscal year. */
export function closeAccountingYear(input: {
  fiscalYear: string;
  operatorId: string;
}): AnnualCloseResult {
  assertFiscalYear(input.fiscalYear);
  return withYamlFileLock(
    `${annualCloseTransactionPath(input.fiscalYear)}.operation`,
    () => closeAccountingYearUnlocked(input),
    { retries: 120, retryDelayMs: 25 },
  );
}
