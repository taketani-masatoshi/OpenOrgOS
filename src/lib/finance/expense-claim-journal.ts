import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  expenseClaimAccountingSchema,
  journalEntriesFileSchema,
  journalEntrySchema,
  type ExpenseClaimAccounting,
  type JournalEntriesFile,
  type JournalEntry,
} from "../../../schemas/finance/journal-entry.js";
import type { ExpenseClaimAllocation } from "../../../schemas/finance/expense-claim.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { assertJournalWriteAllowed } from "./journal-write-guard.js";
import { assertMonthUnlockedForDate } from "./period-lock.js";
import { assertJournalPostGuards } from "./journal-post-guards.js";
import { getClock } from "../runtime-context.js";
import { assertReconciliationReadable, withFinanceMutation } from "./reconciliation-transaction.js";

const JOURNAL_REL = "finance/journal-entries.yaml";
const ACCOUNTING_REL = "finance/expense-claim-accounting.yaml";

export function journalEntriesPath(): string {
  return join(getDataDir(), JOURNAL_REL);
}

export function loadJournalEntries(): JournalEntriesFile {
  assertReconciliationReadable();
  const path = journalEntriesPath();
  return existsSync(path)
    ? readYamlFile(path, journalEntriesFileSchema)
    : journalEntriesFileSchema.parse({ version: 1, entries: [] });
}

export function loadExpenseClaimAccounting(): ExpenseClaimAccounting {
  const path = join(getDataDir(), ACCOUNTING_REL);
  if (!existsSync(path)) {
    throw new Error(`Expense claim accounting mapping is required: data/${ACCOUNTING_REL}`);
  }
  return readYamlFile(path, expenseClaimAccountingSchema);
}

export function saveJournalEntries(file: JournalEntriesFile, opts?: { mode?: "migration" }): void {
  return withFinanceMutation(() => saveJournalEntriesInner(file, opts));
}

function saveJournalEntriesInner(file: JournalEntriesFile, opts?: { mode?: "migration" }): void {
  assertJournalWriteAllowed();
  if (opts?.mode === "migration" && process.env.ORGOS_ALLOW_JOURNAL_MIGRATION !== "1") {
    throw new Error("journal migration rewrite requires ORGOS_ALLOW_JOURNAL_MIGRATION=1");
  }
  if (opts?.mode !== "migration") {
    const existing = loadJournalEntries();
    if (existing.entries.length > 0) {
      throw new Error(
        "saveJournalEntries is append-only; use appendJournalEntry or migration backfill (mode: migration)"
      );
    }
  }
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(journalEntriesPath(), journalEntriesFileSchema.parse(file));
}

function isAnnualPlTransfer(entry: JournalEntry): boolean {
  const source = entry.source;
  return (
    source?.kind === "closing" &&
    source.adjustment_id === "pl-transfer" &&
    /^JE-CLOSE-FY\d{4}-PL-TRANSFER$/.test(entry.entry_id)
  );
}

export function appendJournalEntry(
  entry: JournalEntry,
  meta?: { postedBy?: string; postedAt?: string; allowAnnualPlTransfer?: boolean }
): JournalEntry {
  return withFinanceMutation(() => appendJournalEntryInner(entry, meta));
}

function appendJournalEntryInner(
  entry: JournalEntry,
  meta?: { postedBy?: string; postedAt?: string; allowAnnualPlTransfer?: boolean }
): JournalEntry {
  assertJournalWriteAllowed();
  if (!(meta?.allowAnnualPlTransfer && isAnnualPlTransfer(entry))) {
    assertMonthUnlockedForDate(entry.occurred_at);
  }
  const file = loadJournalEntries();
  const existing = file.entries.find((row) => row.entry_id === entry.entry_id);
  const enriched = journalEntrySchema.parse({
    ...entry,
    posted_at: entry.posted_at ?? meta?.postedAt ?? getClock().now().toISOString(),
    posted_by:
      entry.posted_by ??
      meta?.postedBy ??
      (entry.source?.kind === "manual" ? entry.source.authorized_by : "system"),
  });
  assertJournalPostGuards(enriched);
  if (existing) {
    const core = (e: JournalEntry) => ({
      occurred_at: e.occurred_at,
      description: e.description,
      source: e.source,
      lines: e.lines,
      evidence_refs: e.evidence_refs,
      reversal_of: e.reversal_of,
      reversed_source_kind: e.reversed_source_kind,
    });
    if (JSON.stringify(core(existing)) === JSON.stringify(core(enriched))) {
      return existing;
    }
    throw new Error(`Journal entry id collision: ${entry.entry_id}`);
  }
  file.entries.push(enriched);
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(journalEntriesPath(), journalEntriesFileSchema.parse(file));
  return enriched;
}

export function postExpenseClaimJournal(input: {
  claimId: string;
  occurredAt: string;
  allocations: ExpenseClaimAllocation[];
  receiptId: string;
  receiptDigest: string;
  evidenceArchiveRef?: string;
}): JournalEntry {
  const accounting = loadExpenseClaimAccounting();
  return appendJournalEntry(
    journalEntrySchema.parse({
      entry_id: `JE-${input.claimId}-POST`,
      occurred_at: input.occurredAt,
      description: `Expense claim posted ${input.claimId}`,
      claim_id: input.claimId,
      event: "expense_claim_posted",
      evidence_refs: [
        `receipt:${input.receiptId}`,
        `sha256:${input.receiptDigest}`,
        ...(input.evidenceArchiveRef ? [input.evidenceArchiveRef] : []),
      ],
      lines: [
        ...input.allocations.map((allocation) => ({
          account_code: allocation.account_code,
          debit_yen: allocation.amount_yen,
          credit_yen: 0,
          org_unit_id: allocation.org_unit_id,
          person_id: allocation.person_id,
          tax_category: allocation.tax_category,
          tax_amount_yen: allocation.tax_amount_yen,
          invoice_status: allocation.invoice_status,
          purchase_use: allocation.purchase_use,
          tax_rounding: allocation.tax_rounding,
        })),
        {
          account_code: accounting.payable_account_code,
          debit_yen: 0,
          credit_yen: input.allocations.reduce((sum, allocation) => sum + allocation.amount_yen, 0),
        },
      ],
    })
  );
}

export function reimburseExpenseClaimJournal(input: {
  claimId: string;
  occurredAt: string;
  amountYen: number;
  sourceBankAccountId: string;
  evidenceRefs: string[];
}): JournalEntry {
  const accounting = loadExpenseClaimAccounting();
  const bankAccountCode = accounting.bank_control_accounts[input.sourceBankAccountId];
  if (!bankAccountCode) {
    throw new Error(`No bank control account mapping for ${input.sourceBankAccountId}`);
  }
  return appendJournalEntry(
    journalEntrySchema.parse({
      entry_id: `JE-${input.claimId}-REIMBURSE`,
      occurred_at: input.occurredAt,
      description: `Expense claim reimbursed ${input.claimId}`,
      claim_id: input.claimId,
      event: "expense_claim_reimbursed",
      evidence_refs: input.evidenceRefs,
      lines: [
        {
          account_code: accounting.payable_account_code,
          debit_yen: input.amountYen,
          credit_yen: 0,
        },
        {
          account_code: bankAccountCode,
          debit_yen: 0,
          credit_yen: input.amountYen,
          source_bank_account_id: input.sourceBankAccountId,
        },
      ],
    })
  );
}

export function journalIntegrityIssues(): string[] {
  if (!existsSync(journalEntriesPath())) return [];
  try {
    const file = loadJournalEntries();
    const ids = new Set<string>();
    const issues: string[] = [];
    for (const entry of file.entries) {
      if (ids.has(entry.entry_id)) {
        issues.push(`${entry.entry_id}: duplicate journal entry`);
      }
      ids.add(entry.entry_id);
    }
    return issues;
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
