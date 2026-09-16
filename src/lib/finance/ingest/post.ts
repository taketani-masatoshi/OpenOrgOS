import {
  journalEntrySchema,
  type JournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../../data.js";
import { loadTenantConfig } from "../../tenant.js";
import { appendJournalEntry } from "../expense-claim-journal.js";
import { assertMonthUnlockedForDate } from "../period-lock.js";
import { upsertBankStatementsFromIngest } from "../bank-statement-import-service.js";
import {
  loadIngestRules,
  loadIngestStaging,
  readInboxFileContent,
  saveIngestStaging,
} from "./store.js";
import { dateToJournalOccurredAt } from "./journal-time.js";
import { markIngestInboxDoneIfComplete } from "./inbox-lifecycle.js";
import type {
  IngestStagingBatch,
  IngestStagingRow,
} from "../../../../schemas/finance/ingest.js";

const OWNER_DRAW_ACCOUNT = "3210";

export type IngestPostResult = {
  posted: number;
  skipped: number;
  redirected_to_intake: string[];
  entry_ids: string[];
  dry_run: boolean;
  errors: string[];
  bank_statements_added?: number;
};

function isSoleProprietorship(): boolean {
  try {
    return loadTenantConfig().entity_form === "sole_proprietorship";
  } catch {
    return false;
  }
}

function entryIdForRow(fingerprint: string): string {
  return `JE-ING-${fingerprint.slice(0, 12).toUpperCase()}`;
}

function coaCodes(): Set<string> {
  try {
    return new Set(loadChartOfAccounts().accounts.map((a) => a.code));
  } catch {
    return new Set();
  }
}

export function buildJournalFromRow(
  row: IngestStagingRow,
  authorizedBy: string,
  cashDefault: string,
  soleProp: boolean,
): JournalEntry {
  const cash = row.cash_account_code ?? cashDefault;
  const pl = row.account_code!;
  const amount = row.amount_yen;
  const pct = soleProp ? (row.business_pct ?? 100) : 100;
  const businessYen = Math.round((amount * pct) / 100);
  const householdYen = soleProp ? amount - businessYen : 0;
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
                  account_code: OWNER_DRAW_ACCOUNT,
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
    occurred_at: dateToJournalOccurredAt(row.occurred_on),
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

type PreflightOk = {
  row: IngestStagingRow;
  entry: JournalEntry;
  kind: "post";
};

type PreflightRedirect = {
  row: IngestStagingRow;
  kind: "redirect";
  note: string;
};

type PreflightSkip = {
  row: IngestStagingRow;
  kind: "skip";
};

function preflightRow(
  row: IngestStagingRow,
  opts: {
    authorizedBy: string;
    cashDefault: string;
    assetThreshold: number;
    soleProp: boolean;
    codes: Set<string>;
  },
): PreflightOk | PreflightRedirect | PreflightSkip | { kind: "error"; message: string; row: IngestStagingRow } {
  if (row.status === "posted") return { kind: "skip", row };
  if (row.status !== "classified" || !row.account_code) return { kind: "skip", row };

  if (!opts.soleProp && (row.business_pct ?? 100) !== 100) {
    return {
      kind: "error",
      row,
      message: `${row.row_id}: corporate entity cannot post business_pct≠100 (got ${row.business_pct})`,
    };
  }

  if (
    row.direction === "outflow" &&
    row.amount_yen >= opts.assetThreshold
  ) {
    const note = opts.soleProp
      ? `asset band ≥${opts.assetThreshold}: use orgos operations sole-prop-blue expense-intake clarify --amount ${row.amount_yen}`
      : `asset band ≥${opts.assetThreshold}: confirm fixed-asset register / accounting review (do not auto-post)`;
    return { kind: "redirect", row, note };
  }

  const cash = row.cash_account_code ?? opts.cashDefault;
  const needed = [row.account_code, cash];
  if (opts.soleProp && (row.business_pct ?? 100) < 100) {
    needed.push(OWNER_DRAW_ACCOUNT);
  }
  for (const code of needed) {
    if (opts.codes.size > 0 && !opts.codes.has(code)) {
      return {
        kind: "error",
        row,
        message: `${row.row_id}: unknown CoA account ${code}`,
      };
    }
  }

  const entry = buildJournalFromRow(
    row,
    opts.authorizedBy,
    opts.cashDefault,
    opts.soleProp,
  );
  try {
    assertMonthUnlockedForDate(entry.occurred_at);
  } catch (err) {
    return {
      kind: "error",
      row,
      message: `${row.row_id}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { kind: "post", row, entry };
}

export function postIngestBatch(input: {
  batchId: string;
  write?: boolean;
  authorizedBy?: string;
}): IngestPostResult {
  const rules = loadIngestRules();
  const staging = loadIngestStaging();
  const authorizedBy = input.authorizedBy ?? "ingest";
  const soleProp = isSoleProprietorship();
  const codes = coaCodes();
  const batch = staging.batches.find((b) => b.batch_id === input.batchId);
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

  const preflight = target.map((row) =>
    preflightRow(row, {
      authorizedBy,
      cashDefault: rules.default_cash_account_code,
      assetThreshold: rules.asset_intake_threshold_yen,
      soleProp,
      codes,
    }),
  );

  const errors = preflight
    .filter((p): p is { kind: "error"; message: string; row: IngestStagingRow } => p.kind === "error")
    .map((p) => p.message);

  // Atomic: any hard error → write nothing
  if (errors.length > 0) {
    return {
      posted: 0,
      skipped: 0,
      redirected_to_intake: [],
      entry_ids: [],
      dry_run: !input.write,
      errors,
    };
  }

  let posted = 0;
  let skipped = 0;
  const redirected_to_intake: string[] = [];
  const entry_ids: string[] = [];
  const rowUpdates = new Map<string, IngestStagingRow>();

  for (const p of preflight) {
    if (p.kind === "skip") {
      skipped += 1;
      continue;
    }
    if (p.kind === "redirect") {
      redirected_to_intake.push(p.row.row_id);
      skipped += 1;
      rowUpdates.set(p.row.row_id, {
        ...p.row,
        status: "needs_review",
        review_notes: [...p.row.review_notes, p.note],
      });
      continue;
    }
    // post
    if (!input.write) {
      posted += 1;
      entry_ids.push(p.entry.entry_id);
      continue;
    }
    try {
      const saved = appendJournalEntry(p.entry, { postedBy: authorizedBy });
      posted += 1;
      entry_ids.push(saved.entry_id);
      rowUpdates.set(p.row.row_id, {
        ...p.row,
        status: "posted",
        entry_id: saved.entry_id,
      });
    } catch (err) {
      errors.push(
        `${p.row.row_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Mid-append failure after successful preflight: keep partial (rare)
  if (input.write && errors.length > 0 && posted === 0 && rowUpdates.size === 0) {
    return {
      posted: 0,
      skipped,
      redirected_to_intake,
      entry_ids: [],
      dry_run: false,
      errors,
    };
  }

  let bank_statements_added: number | undefined;
  if (input.write) {
    const nextRows = staging.rows.map((row) => rowUpdates.get(row.row_id) ?? row);
    saveIngestStaging({ ...staging, rows: nextRows });

    if (batch?.source_kind === "bank" && posted > 0) {
      try {
        const { content } = readInboxFileContent(batch.logical_path);
        const bankResult = upsertBankStatementsFromIngest({
          csvText: content,
          ingestBatchId: batch.batch_id,
          sourceFileFingerprint: batch.file_fingerprint,
        });
        bank_statements_added = bankResult.added;
      } catch (err) {
        errors.push(
          `bank-statements: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    markIngestInboxDoneIfComplete(batch, nextRows.filter((r) => r.batch_id === input.batchId));
  }

  return {
    posted,
    skipped,
    redirected_to_intake,
    entry_ids,
    dry_run: !input.write,
    errors,
    bank_statements_added,
  };
}

export type { IngestStagingBatch };
