import {
  postApPaymentJournalEntry,
  postArReceiptJournalEntry,
} from "./journal-sources.js";
import { reverseJournalEntry } from "./journal-reverse.js";
import { appendJournalEntry, loadJournalEntries } from "./expense-claim-journal.js";

export type BankReconciliationSettleKind = "ar" | "ap";

/** GL entry id for a reconciliation applied event. */
export function reconciliationGlEntryId(
  kind: BankReconciliationSettleKind,
  eventId: string,
): string {
  const prefix = kind === "ar" ? "JE-AR" : "JE-AP";
  const safe = eventId.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 64);
  return `${prefix}-${safe}`;
}

/**
 * Post cash settlement for a bank reconciliation match.
 * AR inflow: Dr cash / Cr 1150. AP outflow: Dr 2110 / Cr cash.
 */
export function postBankReconciliationGl(input: {
  eventId: string;
  kind: BankReconciliationSettleKind;
  amountYen: number;
  counterpartyId: string;
  occurredAt: string;
  authorizedBy: string;
}): string {
  const ledgerEntryId = input.eventId
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .slice(0, 64);
  if (input.kind === "ar") {
    return postArReceiptJournalEntry({
      ledgerEntryId,
      amountYen: input.amountYen,
      counterpartyId: input.counterpartyId,
      occurredAt: input.occurredAt,
      authorizedBy: input.authorizedBy,
    });
  }
  return postApPaymentJournalEntry({
    ledgerEntryId,
    amountYen: input.amountYen,
    counterpartyId: input.counterpartyId,
    occurredAt: input.occurredAt,
    authorizedBy: input.authorizedBy,
  });
}

/** Reverse the GL posted for a prior reconciliation.applied event. */
export function reverseBankReconciliationGl(input: {
  targetEventId: string;
  authorizedBy: string;
  occurredAt?: string;
}): string | null {
  const safe = input.targetEventId
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .slice(0, 64);
  const candidates = [`JE-AR-${safe}`, `JE-AP-${safe}`];
  const file = loadJournalEntries();
  const original = file.entries.find((row) => candidates.includes(row.entry_id));
  if (!original) return null;
  const reversal = reverseJournalEntry({
    entryId: original.entry_id,
    authorizedBy: input.authorizedBy,
    occurredAt: input.occurredAt,
  });
  const saved = appendJournalEntry(reversal, { postedBy: input.authorizedBy });
  return saved.entry_id;
}

/** Infer AR vs AP from bank statement direction or ar-ap ledger kind. */
export function resolveReconciliationSettleKind(input: {
  bankDirection?: "inflow" | "outflow" | "transfer" | string;
  arApKind?: "ar" | "ap" | string;
}): BankReconciliationSettleKind {
  if (input.arApKind === "ap" || input.arApKind === "ar") return input.arApKind;
  if (input.bankDirection === "outflow") return "ap";
  return "ar";
}
