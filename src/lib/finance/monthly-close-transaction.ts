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

/** Build aborted-entry id set once per evaluation (avoid O(n²) journal reloads). */
export function buildCloseAbortIdSet(
  entries: ReturnType<typeof loadJournalEntries>["entries"] = loadJournalEntries().entries,
): Set<string> {
  const aborted = new Set<string>();
  for (const entry of entries) {
    if (entry.entry_id.endsWith("-ABORT")) {
      const base = entry.entry_id.slice(0, -"-ABORT".length);
      if (base) aborted.add(base);
    }
    if (
      entry.reversal_of &&
      entry.evidence_refs.includes(`close-abort:${entry.reversal_of}`)
    ) {
      aborted.add(entry.reversal_of);
    }
  }
  return aborted;
}

export function isClosePostAbortedInSet(entryId: string, aborted: Set<string>): boolean {
  return aborted.has(entryId);
}

/** True when a close attempt reversed this entry with a stable -ABORT journal. */
export function isClosePostAborted(entryId: string): boolean {
  return isClosePostAbortedInSet(entryId, buildCloseAbortIdSet());
}

/**
 * After abort, fixed close ids collide with appendJournalEntry idempotency.
 * Allocate base id on first try; `-R{n}` only when the base (or prior retry) was aborted.
 */
export function allocateCloseEntryId(baseId: string): string {
  const entries = loadJournalEntries().entries;
  const aborted = buildCloseAbortIdSet(entries);
  const ids = new Set(entries.map((entry) => entry.entry_id));
  const isActive = (id: string) => ids.has(id) && !aborted.has(id);
  if (!ids.has(baseId)) return baseId;
  if (isActive(baseId)) return baseId;
  let n = 1;
  while (n < 10_000) {
    const candidate = `${baseId}-R${n}`;
    if (!ids.has(candidate) || isActive(candidate)) return candidate;
    n += 1;
  }
  throw new Error(`Unable to allocate close entry id for ${baseId}`);
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
  let entries = loadJournalEntries().entries;
  let aborted = buildCloseAbortIdSet(entries);
  for (const entryId of input.entryIds) {
    if (isClosePostAbortedInSet(entryId, aborted)) {
      abortIds.push(closeAbortReversalId(entryId));
      continue;
    }
    if (!entries.some((row) => row.entry_id === entryId)) continue;
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
    entries = loadJournalEntries().entries;
    aborted = buildCloseAbortIdSet(entries);
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
  // Crash window: lock taken but state file never flipped to committed.
  if (existing?.phase === "posted" && isMonthLocked(input.month)) {
    return markMonthlyCloseCommitted(existing);
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
