/**
 * Monthly close transaction — journals, evidence, and period lock commit together.
 * Failure rolls back only entries created in this attempt (append-only via -ABORT reversals).
 *
 * Status labels (ChatGPT 受入用):
 * - 実装済み: preflight → post → postflight → lock | abort
 * - 隔離検証済み: monthly-close-acceptance（合成 fixture）
 * - MAL実データ未検証
 * - 法定申告未対応
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";
import { reverseJournalEntry } from "./journal-reverse.js";
import { isMonthLocked } from "./period-lock.js";
import { lastDayOfMonth } from "./fiscal-year.js";

const monthlyCloseTransactionSchema = z.object({
  version: z.literal(1),
  transaction_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  operator_id: z.string().min(1),
  phase: z.enum(["prepared", "posted", "committed", "aborted"]),
  posted_entry_ids: z.array(z.string().min(1)).default([]),
  abort_entry_ids: z.array(z.string().min(1)).default([]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type MonthlyCloseTransaction = z.output<typeof monthlyCloseTransactionSchema>;

export function monthlyCloseTransactionPath(month: string): string {
  return join(getDataDir(), "finance", `monthly-close.${month}.state.yaml`);
}

export function loadMonthlyCloseTransaction(month: string): MonthlyCloseTransaction | null {
  const path = monthlyCloseTransactionPath(month);
  if (!existsSync(path)) return null;
  return readYamlFile(path, monthlyCloseTransactionSchema);
}

export function saveMonthlyCloseTransaction(state: MonthlyCloseTransaction): void {
  writeYamlFileAtomic(
    monthlyCloseTransactionPath(state.month),
    monthlyCloseTransactionSchema.parse(state),
  );
}

export function closeAbortReversalId(entryId: string): string {
  return `${entryId}-ABORT`;
}

/** True when a close attempt reversed this entry with a stable -ABORT journal. */
export function isClosePostAborted(entryId: string): boolean {
  return loadJournalEntries().entries.some(
    (entry) =>
      entry.entry_id === closeAbortReversalId(entryId) ||
      (entry.reversal_of === entryId &&
        entry.evidence_refs.includes(`close-abort:${entryId}`)),
  );
}

/**
 * Reverse journals created by a failed close. Idempotent for ids already aborted.
 * Does not delete rows (append-only).
 */
export function abortMonthlyClosePosts(input: {
  entryIds: string[];
  operatorId: string;
  occurredAt?: string;
}): string[] {
  const abortIds: string[] = [];
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  for (const entryId of input.entryIds) {
    if (isClosePostAborted(entryId)) {
      abortIds.push(closeAbortReversalId(entryId));
      continue;
    }
    const exists = loadJournalEntries().entries.some((row) => row.entry_id === entryId);
    if (!exists) continue;
    const reversal = reverseJournalEntry({
      entryId,
      authorizedBy: input.operatorId,
      reversalEntryId: closeAbortReversalId(entryId),
      occurredAt,
    });
    const withEvidence = {
      ...reversal,
      evidence_refs: [`close-abort:${entryId}`, ...reversal.evidence_refs],
    };
    appendJournalEntry(withEvidence, { postedBy: input.operatorId });
    abortIds.push(closeAbortReversalId(entryId));
  }
  return abortIds;
}

export function journalIdsCreatedSince(beforeIds: Set<string>): string[] {
  return loadJournalEntries()
    .entries.map((entry) => entry.entry_id)
    .filter((id) => !beforeIds.has(id));
}

export function beginMonthlyCloseTransaction(input: {
  month: string;
  operatorId: string;
}): MonthlyCloseTransaction {
  const existing = loadMonthlyCloseTransaction(input.month);
  if (existing?.phase === "committed" && isMonthLocked(input.month)) {
    return existing;
  }
  const now = new Date().toISOString();
  if (existing?.phase === "posted" && existing.posted_entry_ids.length > 0) {
    // Crash window: journals written, lock not taken — resume by returning state.
    return existing;
  }
  const state: MonthlyCloseTransaction = {
    version: 1,
    transaction_id: randomUUID(),
    month: input.month,
    operator_id: input.operatorId,
    phase: "prepared",
    posted_entry_ids: [],
    abort_entry_ids: [],
    created_at: now,
    updated_at: now,
  };
  saveMonthlyCloseTransaction(state);
  return state;
}

export function markMonthlyClosePosted(
  state: MonthlyCloseTransaction,
  postedEntryIds: string[],
): MonthlyCloseTransaction {
  const next = {
    ...state,
    phase: "posted" as const,
    posted_entry_ids: postedEntryIds,
    updated_at: new Date().toISOString(),
  };
  saveMonthlyCloseTransaction(next);
  return next;
}

export function markMonthlyCloseCommitted(
  state: MonthlyCloseTransaction,
): MonthlyCloseTransaction {
  const next = {
    ...state,
    phase: "committed" as const,
    updated_at: new Date().toISOString(),
  };
  saveMonthlyCloseTransaction(next);
  return next;
}

export function markMonthlyCloseAborted(
  state: MonthlyCloseTransaction,
  abortEntryIds: string[],
): MonthlyCloseTransaction {
  const next = {
    ...state,
    phase: "aborted" as const,
    abort_entry_ids: abortEntryIds,
    updated_at: new Date().toISOString(),
  };
  saveMonthlyCloseTransaction(next);
  return next;
}

export function defaultCloseAbortOccurredAt(month: string): string {
  return `${lastDayOfMonth(month)}T23:59:59.000Z`;
}
