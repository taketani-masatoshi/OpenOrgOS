import type { JournalEntry } from "../../../schemas/finance/journal-entry.js";
import {
  loadJournalEntries,
  saveJournalEntries,
} from "./expense-claim-journal.js";

function inferPostedBy(entry: JournalEntry): string {
  if (entry.posted_by) return entry.posted_by;
  const source = entry.source;
  if (source?.kind === "manual" && source.authorized_by) {
    return source.authorized_by;
  }
  if (source?.kind === "closing") return "closing";
  if (source?.kind === "depreciation") return "depreciation";
  if (source?.kind === "payroll") return "payroll";
  if (source?.kind === "ar_ap") return "ar_ap";
  if (source?.kind === "consumption_tax_refund") return "accounting";
  if (source?.kind === "remittance") return "remittance";
  return "migration-backfill";
}

function inferPostedAt(entry: JournalEntry): string {
  if (entry.posted_at) return entry.posted_at;
  const raw = entry.occurred_at;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.includes("T") ? raw : `${raw}T00:00:00.000Z`;
  }
  return raw;
}

export type JournalAuditBackfillResult = {
  updated_entries: number;
  dry_run: boolean;
};

export function backfillJournalAuditTrail(input?: {
  dryRun?: boolean;
}): JournalAuditBackfillResult {
  const file = loadJournalEntries();
  let updatedEntries = 0;
  const nextEntries = file.entries.map((entry) => {
    const posted_at = inferPostedAt(entry);
    const posted_by = inferPostedBy(entry);
    if (entry.posted_at === posted_at && entry.posted_by === posted_by) {
      return entry;
    }
    updatedEntries += 1;
    return { ...entry, posted_at, posted_by };
  });

  if (!input?.dryRun && updatedEntries > 0) {
    saveJournalEntries({ ...file, entries: nextEntries }, { mode: "migration" });
  }

  return {
    updated_entries: updatedEntries,
    dry_run: Boolean(input?.dryRun),
  };
}
