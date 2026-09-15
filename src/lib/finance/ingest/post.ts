import {
  journalEntrySchema,
  type JournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import { appendJournalEntry } from "../expense-claim-journal.js";
import { loadIngestRules, loadIngestStaging, saveIngestStaging } from "./store.js";
import type { IngestStagingRow } from "../../../../schemas/finance/ingest.js";

export type IngestPostResult = {
  posted: number;
  skipped: number;
  redirected_to_intake: string[];
  entry_ids: string[];
  dry_run: boolean;
  errors: string[];
};

function entryIdForRow(fingerprint: string): string {
  return `JE-ING-${fingerprint.slice(0, 12).toUpperCase()}`;
}

function buildJournalFromRow(
  row: IngestStagingRow,
  authorizedBy: string,
  cashDefault: string,
): JournalEntry {
  const cash = row.cash_account_code ?? cashDefault;
  const pl = row.account_code!;
  const amount = row.amount_yen;
  const pct = row.business_pct ?? 100;
  const businessYen = Math.round((amount * pct) / 100);
  const householdYen = amount - businessYen;
  const plTax = row.tax_category ?? "taxable_10";
  const cashTax = "out_of_scope" as const;
  const lines =
    row.direction === "outflow"
      ? [
          {
            account_code: pl,
            debit_yen: businessYen,
            credit_yen: 0,
            tax_category: plTax,
          },
          ...(householdYen > 0
            ? [
                {
                  account_code: "3210",
                  debit_yen: householdYen,
                  credit_yen: 0,
                  tax_category: cashTax,
                },
              ]
            : []),
          {
            account_code: cash,
            debit_yen: 0,
            credit_yen: amount,
            tax_category: cashTax,
          },
        ]
      : [
          {
            account_code: cash,
            debit_yen: amount,
            credit_yen: 0,
            tax_category: cashTax,
          },
          {
            account_code: pl,
            debit_yen: 0,
            credit_yen: amount,
            tax_category: plTax,
          },
        ];

  return journalEntrySchema.parse({
    entry_id: entryIdForRow(row.fingerprint),
    occurred_at: `${row.occurred_on}T03:00:00.000Z`,
    description: `${row.source_kind}: ${row.description || row.payee || row.row_id}`,
    source: {
      kind: "ingest",
      batch_id: row.batch_id,
      row_fingerprint: row.fingerprint,
      authorized_by: authorizedBy,
    },
    evidence_refs: row.evidence_refs,
    lines,
  });
}

export function postIngestBatch(input: {
  batchId: string;
  write?: boolean;
  authorizedBy?: string;
}): IngestPostResult {
  const rules = loadIngestRules();
  const staging = loadIngestStaging();
  const authorizedBy = input.authorizedBy ?? "ingest";
  const target = staging.rows.filter((r) => r.batch_id === input.batchId);
  if (target.length === 0) {
    return {
      posted: 0,
      skipped: 0,
      redirected_to_intake: [],
      entry_ids: [],
      dry_run: !input.write,
      errors: [`batch not found: ${input.batchId}`],
    };
  }

  let posted = 0;
  let skipped = 0;
  const redirected_to_intake: string[] = [];
  const entry_ids: string[] = [];
  const errors: string[] = [];
  const nextRows = staging.rows.map((row) => {
    if (row.batch_id !== input.batchId) return row;
    if (row.status === "posted") {
      skipped += 1;
      return row;
    }
    if (row.status !== "classified" || !row.account_code) {
      skipped += 1;
      return row;
    }
    if (
      row.direction === "outflow" &&
      row.amount_yen >= rules.asset_intake_threshold_yen
    ) {
      redirected_to_intake.push(row.row_id);
      skipped += 1;
      return {
        ...row,
        status: "needs_review" as const,
        review_notes: [
          ...row.review_notes,
          `asset band ≥${rules.asset_intake_threshold_yen}: use orgos operations sole-prop-blue expense-intake clarify --amount ${row.amount_yen}`,
        ],
      };
    }

    const entry = buildJournalFromRow(
      row,
      authorizedBy,
      rules.default_cash_account_code,
    );
    if (!input.write) {
      posted += 1;
      entry_ids.push(entry.entry_id);
      return row;
    }
    try {
      const saved = appendJournalEntry(entry, { postedBy: authorizedBy });
      posted += 1;
      entry_ids.push(saved.entry_id);
      return {
        ...row,
        status: "posted" as const,
        entry_id: saved.entry_id,
      };
    } catch (err) {
      errors.push(
        `${row.row_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return row;
    }
  });

  if (input.write && errors.length === 0) {
    saveIngestStaging({ ...staging, rows: nextRows });
  } else if (input.write && posted > 0) {
    saveIngestStaging({ ...staging, rows: nextRows });
  }

  return {
    posted,
    skipped,
    redirected_to_intake,
    entry_ids,
    dry_run: !input.write,
    errors,
  };
}
