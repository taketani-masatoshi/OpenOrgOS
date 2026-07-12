import type { TransactionRecord } from "../../../schemas/protocol/transaction-record.js";
import {
  findEnvelopeFileForWitness,
  fetchReceiptsFromPool,
  verifyCachedReceiptsForEvent,
} from "./witness-client.js";
import { isWitnessEnabled, loadWitnessPoolConfig } from "./witness-pool.js";
import { listWitnessPending } from "./witness-queue.js";
import { listWirePending } from "./wire-queue.js";
import { listTransactions, removeTransactionsById } from "./transactions.js";

export type TransactionOrphanReason =
  "envelope-missing" | "witness-receipt-missing" | "wire-pending" | "witness-pending";

export interface TransactionOrphanCandidate {
  transaction: TransactionRecord;
  reasons: TransactionOrphanReason[];
  orphan: boolean;
}

export interface EvaluateTransactionOrphansOptions {
  peerId?: string;
  since?: string;
  /** Attempt hub fetch before marking witness-receipt-missing */
  fetchReceipts?: boolean;
}

export interface PruneOrphanTransactionsOptions extends EvaluateTransactionOrphansOptions {
  apply?: boolean;
}

export interface PruneOrphanTransactionsResult {
  candidates: TransactionOrphanCandidate[];
  orphans: TransactionOrphanCandidate[];
  removed: TransactionRecord[];
  dry_run: boolean;
}

function hasPendingDelivery(eventId: string): boolean {
  if (listWirePending().some((p) => p.event_id === eventId)) return true;
  if (listWitnessPending().some((p) => p.event_id === eventId)) return true;
  return false;
}

export async function evaluateTransactionOrphans(
  opts: EvaluateTransactionOrphansOptions = {}
): Promise<TransactionOrphanCandidate[]> {
  const pool = loadWitnessPoolConfig();
  const candidates: TransactionOrphanCandidate[] = [];

  for (const tx of listTransactions({ peerId: opts.peerId, since: opts.since })) {
    if (tx.direction !== "outbound") continue;

    const reasons: TransactionOrphanReason[] = [];
    const hasEnvelope = !!findEnvelopeFileForWitness(tx.event_id);
    if (!hasEnvelope) reasons.push("envelope-missing");

    let receipts = verifyCachedReceiptsForEvent(tx.event_id, pool).receipts;
    if (receipts.length === 0 && opts.fetchReceipts === true && isWitnessEnabled(pool)) {
      receipts = await fetchReceiptsFromPool(tx.event_id, pool);
    }
    if (receipts.length === 0) reasons.push("witness-receipt-missing");

    if (hasPendingDelivery(tx.event_id)) {
      if (listWirePending().some((p) => p.event_id === tx.event_id)) {
        reasons.push("wire-pending");
      }
      if (listWitnessPending().some((p) => p.event_id === tx.event_id)) {
        reasons.push("witness-pending");
      }
    }

    const orphan =
      reasons.includes("envelope-missing") &&
      reasons.includes("witness-receipt-missing") &&
      !reasons.includes("wire-pending") &&
      !reasons.includes("witness-pending");

    candidates.push({ transaction: tx, reasons, orphan });
  }

  return candidates;
}

export async function pruneOrphanTransactions(
  opts: PruneOrphanTransactionsOptions = {}
): Promise<PruneOrphanTransactionsResult> {
  const candidates = await evaluateTransactionOrphans(opts);
  const orphans = candidates.filter((c) => c.orphan);
  const dryRun = opts.apply !== true;
  const removed = dryRun
    ? []
    : removeTransactionsById(orphans.map((c) => c.transaction.transaction_id));

  return {
    candidates,
    orphans,
    removed,
    dry_run: dryRun,
  };
}

export interface WitnessCacheMissingResult {
  checked: number;
  fetched: number;
  still_missing: string[];
}

/** Fetch hub receipts for outbound txs with no local witness cache. */
export async function cacheMissingWitnessReceipts(opts?: {
  peerId?: string;
  since?: string;
}): Promise<WitnessCacheMissingResult> {
  const pool = loadWitnessPoolConfig();
  if (!isWitnessEnabled(pool)) {
    return { checked: 0, fetched: 0, still_missing: [] };
  }

  let checked = 0;
  let fetched = 0;
  const stillMissing: string[] = [];

  for (const tx of listTransactions({ peerId: opts?.peerId, since: opts?.since })) {
    if (tx.direction !== "outbound") continue;
    const before = verifyCachedReceiptsForEvent(tx.event_id, pool).receipts.length;
    if (before > 0) continue;

    checked += 1;
    await fetchReceiptsFromPool(tx.event_id, pool);
    const after = verifyCachedReceiptsForEvent(tx.event_id, pool).receipts.length;
    if (after > 0) fetched += 1;
    else stillMissing.push(tx.event_id);
  }

  return { checked, fetched, still_missing: stillMissing };
}
