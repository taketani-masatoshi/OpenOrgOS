/**
 * Post-time journal guards. Fail closed before the entry is appended.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { JournalEntry } from "../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts } from "../data.js";
import { getDataDir } from "../utils.js";
import { resolveJournalSourceAccounts } from "./journal-source-accounts.js";

function sha256Bytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function assertJournalAccountsExist(entry: JournalEntry): void {
  const coa = loadChartOfAccounts();
  const codes = new Set(coa.accounts.map((account) => account.code));
  for (const line of entry.lines) {
    if (!codes.has(line.account_code)) {
      throw new Error(`Unknown account code in journal: ${line.account_code}`);
    }
  }
}

export function assertPlTaxCategories(entry: JournalEntry): void {
  const coa = loadChartOfAccounts();
  const types = new Map(coa.accounts.map((account) => [account.code, account.type]));
  for (const line of entry.lines) {
    const type = types.get(line.account_code);
    if (type !== "revenue" && type !== "expense") continue;
    if (!line.tax_category) {
      throw new Error(
        `tax_category required on ${type} line ${line.account_code} for ${entry.entry_id}`,
      );
    }
  }
}

export function assertArApCounterparties(entry: JournalEntry): void {
  let receivable: string | undefined;
  let payable: string | undefined;
  try {
    const sources = resolveJournalSourceAccounts();
    receivable = sources.accounts_receivable;
    payable = sources.accounts_payable;
  } catch {
    return;
  }
  const control = new Set(
    [receivable, payable].filter((code): code is string => Boolean(code)),
  );
  for (const line of entry.lines) {
    if (!control.has(line.account_code)) continue;
    if (!line.counterparty_id) {
      throw new Error(
        `counterparty_id required on AR/AP line ${line.account_code} for ${entry.entry_id}`,
      );
    }
  }
}

/** When evidence_refs include both sha256: and file:, the digest must match the file bytes. */
export function assertEvidenceHashes(entry: JournalEntry): void {
  const files = entry.evidence_refs
    .filter((ref) => ref.startsWith("file:"))
    .map((ref) => ref.slice("file:".length));
  const digests = entry.evidence_refs
    .filter((ref) => ref.startsWith("sha256:"))
    .map((ref) => ref.slice("sha256:".length).toLowerCase());
  if (digests.length === 0 || files.length === 0) return;
  for (const relative of files) {
    const absolute = join(getDataDir(), relative);
    if (!existsSync(absolute)) {
      throw new Error(`evidence file missing: ${relative}`);
    }
    const actual = sha256Bytes(readFileSync(absolute));
    if (!digests.includes(actual)) {
      throw new Error(
        `evidence sha256 mismatch for ${relative} (expected one of ${digests.join(",")})`,
      );
    }
  }
}

export function assertJournalPostGuards(entry: JournalEntry): void {
  assertJournalAccountsExist(entry);
  assertPlTaxCategories(entry);
  assertArApCounterparties(entry);
  assertEvidenceHashes(entry);
}
