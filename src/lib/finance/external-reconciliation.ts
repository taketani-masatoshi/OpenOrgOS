import type { ExternalFinanceTransaction } from "../../../schemas/finance/external-transaction.js";

export type ReconciliationCandidate = {
  id: string;
  tenant_id: string;
  type: "INCOME" | "EXPENSE";
  direction: "CREDIT" | "DEBIT";
  counterparty: string;
  amount: string;
  currency: string;
  status: "OPEN" | "PARTIAL";
  available_from?: string;
  available_until?: string;
};

export type ReconciliationResult =
  | { status: "MATCHED"; candidate_id: string; reason: "COUNTERPARTY_AND_AMOUNT" }
  | { status: "REVIEW"; reason: "NO_CANDIDATE" | "AMBIGUOUS" | "AMOUNT_MISMATCH"; candidate_ids: string[] };

const normalizeName = (value: string): string =>
  value.normalize("NFKC").toUpperCase().replace(/[\s\u3000ﾞ゜・。、,./\\()（）-]/g, "");

const canonicalAmount = (value: string, minorUnit: number): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value.trim();
  if (minorUnit <= 0) return String(Math.round(n));
  const scale = 10 ** minorUnit;
  const scaled = Math.round(n * scale) / scale;
  return scaled.toFixed(minorUnit).replace(/\.?0+$/, "");
};

export const externalTransactionIdempotencyKey = (transaction: Pick<ExternalFinanceTransaction, "tenant_id" | "source" | "source_account_id" | "transaction_id">): string =>
  [transaction.tenant_id, transaction.source, transaction.source_account_id ?? "default", transaction.transaction_id].join(":");

export function reconcileExternalTransaction(
  transaction: ExternalFinanceTransaction,
  candidates: readonly ReconciliationCandidate[],
): ReconciliationResult {
  const eligible = candidates.filter((candidate) =>
    candidate.tenant_id === transaction.tenant_id &&
    candidate.type === transaction.type &&
    (candidate.status === "OPEN" || candidate.status === "PARTIAL") &&
    candidate.direction === transaction.direction &&
    candidate.currency === transaction.currency &&
    (!candidate.available_from || transaction.transaction_date.slice(0, 10) >= candidate.available_from)
    && (!candidate.available_until || transaction.transaction_date.slice(0, 10) <= candidate.available_until),
  );
  const name = normalizeName(transaction.payer_or_payee);
  const sameParty = eligible.filter((candidate) => normalizeName(candidate.counterparty) === name);
  if (sameParty.length === 0) return { status: "REVIEW", reason: "NO_CANDIDATE", candidate_ids: [] };

  const minorUnit = transaction.minor_unit ?? 0;
  const sameAmount = sameParty.filter(
    (candidate) =>
      canonicalAmount(candidate.amount, minorUnit) ===
      canonicalAmount(transaction.amount, minorUnit),
  );
  if (sameAmount.length === 1) {
    return { status: "MATCHED", candidate_id: sameAmount[0].id, reason: "COUNTERPARTY_AND_AMOUNT" };
  }
  if (sameAmount.length > 1) {
    return { status: "REVIEW", reason: "AMBIGUOUS", candidate_ids: sameAmount.map((candidate) => candidate.id) };
  }
  return { status: "REVIEW", reason: "AMOUNT_MISMATCH", candidate_ids: sameParty.map((candidate) => candidate.id) };
}
