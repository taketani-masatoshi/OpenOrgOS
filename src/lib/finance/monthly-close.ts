/**
 * Monthly accounting close orchestrator.
 * Gates: monthly-close-gates.ts · Posts: monthly-close-posts.ts ·
 * Bank tie-out: monthly-close-bank.ts · Transaction: monthly-close-transaction.ts
 */
import { createHash } from "node:crypto";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { isMonthLocked, lockMonth } from "./period-lock.js";
import type { PeriodLockEvidence } from "../../../schemas/finance/period-lock.js";
import {
  abortMonthlyClosePosts,
  beginMonthlyCloseTransaction,
  defaultCloseAbortOccurredAt,
  journalIdsCreatedSince,
  markMonthlyCloseAborted,
  markMonthlyCloseCommitted,
  markMonthlyClosePosted,
} from "./monthly-close-transaction.js";
import {
  bankEvidenceSnapshot,
  evaluateMonthlyCloseGates,
  gate,
  monthKey,
  type MonthlyCloseEvaluation,
  type MonthlyCloseResult,
} from "./monthly-close-gates.js";
import { postMonthJournals } from "./monthly-close-posts.js";

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

export {
  evaluateInventoryCloseGate,
  evaluateMonthlyCloseGates,
  type MonthlyCloseEvaluation,
  type MonthlyCloseGate,
  type MonthlyCloseGateLevel,
  type MonthlyCloseResult,
} from "./monthly-close-gates.js";

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
