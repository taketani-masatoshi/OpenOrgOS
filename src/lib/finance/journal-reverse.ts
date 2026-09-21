import {
  journalEntrySchema,
  normalizeJournalEntry,
  type JournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { getClock } from "../runtime-context.js";

export function reverseJournalEntry(input: {
  entryId: string;
  occurredAt?: string;
  authorizedBy: string;
  reversalEntryId?: string;
}): JournalEntry {
  const file = loadJournalEntries();
  const original = file.entries.find((row) => row.entry_id === input.entryId);
  if (!original) {
    throw new Error(`Journal entry not found: ${input.entryId}`);
  }
  const already = file.entries.find((row) => row.reversal_of === input.entryId);
  if (already) {
    throw new Error(
      `Journal entry ${input.entryId} already reversed by ${already.entry_id}`,
    );
  }
  const parsed = journalEntrySchema.parse(normalizeJournalEntry(original));
  const sourceKind = parsed.source?.kind ?? "manual";
  const reversalId =
    input.reversalEntryId ?? `${input.entryId}-REV-${Date.now()}`;
  return journalEntrySchema.parse({
    entry_id: reversalId,
    occurred_at: input.occurredAt ?? getClock().now().toISOString(),
    description: `Reversal of ${input.entryId} (${sourceKind})`,
    source: { kind: "manual", authorized_by: input.authorizedBy },
    reversal_of: input.entryId,
    reversed_source_kind: sourceKind,
    evidence_refs: [`reversal:${input.entryId}`],
    posted_by: input.authorizedBy,
    lines: parsed.lines.map((line) => ({
      ...line,
      debit_yen: line.credit_yen,
      credit_yen: line.debit_yen,
    })),
  });
}
