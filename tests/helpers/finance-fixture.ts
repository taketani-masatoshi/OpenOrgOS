import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { JournalEntry } from "../../schemas/finance/journal-entry.js";
import { journalEntrySchema } from "../../schemas/finance/journal-entry.js";
import type { PeriodLockEvidence } from "../../schemas/finance/period-lock.js";
import { operatorEvidenceHash } from "../../src/lib/finance/period-lock.js";
import {
  loadJournalEntries,
  saveJournalEntries,
} from "../../src/lib/finance/expense-claim-journal.js";
import { setTenantId, getTenantDir } from "../../src/lib/tenant.js";

/** Isolated tenant for finance / GL / ledger vitest — safe for journal writes. */
export const FINANCE_FIXTURE_TENANT = "_fixture-books";

export function useFinanceFixtureTenant(): void {
  setTenantId(FINANCE_FIXTURE_TENANT);
}

/** Reset fixture journal ledger between tests (append-only file accumulates otherwise). */
export function resetFixtureJournalEntries(): void {
  useFinanceFixtureTenant();
  const base = join(getTenantDir(), "data/finance");
  writeFileSync(join(base, "journal-entries.yaml"), "version: 1\nentries: []\n", "utf-8");
  writeFileSync(join(base, "period-locks.yaml"), "version: 1\nlocks: []\n", "utf-8");
}

const FIXTURE_EVIDENCE_HASH = "ab".repeat(32);

/** Schema-valid close evidence for tests that only need a locked month. */
export function fixturePeriodLockEvidence(operatorId: string): PeriodLockEvidence {
  return {
    version: 1,
    algorithm: "sha256",
    journal_entries_sha256: FIXTURE_EVIDENCE_HASH,
    bank_reconciliation_sha256: FIXTURE_EVIDENCE_HASH,
    trial_balance_sha256: FIXTURE_EVIDENCE_HASH,
    gate_results_sha256: FIXTURE_EVIDENCE_HASH,
    operator_sha256: operatorEvidenceHash(operatorId),
    can_lock: true,
    gate_results: [],
  };
}

/** Append a journal row without post-time guards (close gates still evaluate it). */
export function injectJournalEntryViaMigration(entry: JournalEntry): void {
  useFinanceFixtureTenant();
  const prior = process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
  process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
  try {
    const file = loadJournalEntries();
    file.entries.push(
      journalEntrySchema.parse({
        ...entry,
        posted_at: entry.posted_at ?? entry.occurred_at,
        posted_by:
          entry.posted_by ??
          (entry.source?.kind === "manual" ? entry.source.authorized_by : "system"),
      }),
    );
    saveJournalEntries(file, { mode: "migration" });
  } finally {
    if (prior == null) delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    else process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = prior;
  }
}

const STATEMENT_ROLES: Record<string, readonly [string | null, string]> = {
  "1100": ["current", "cash"],
  "1200": ["noncurrent", "fixed_asset"],
  "1210": ["noncurrent", "fixed_asset"],
  "1290": ["noncurrent", "fixed_asset"],
  "1150": ["current", "receivable"],
  "1300": ["noncurrent", "receivable"],
  "2100": ["noncurrent", "loan"],
  "2120": ["current", "payable"],
  "2130": ["current", "payable"],
  "2140": ["current", "payable"],
  "2160": ["current", "payable"],
  "2110": ["current", "payable"],
  "2165": ["current", "payable"],
  "2170": ["current", "receivable"],
  "3100": [null, "equity"],
  "3200": [null, "equity"],
};

/**
 * Tests restore the fixture chart from git HEAD, which has no statement roles.
 * Tag the live file after that restore so close and statements can use bs_class / cf_role.
 */
export function applyFixtureStatementRoles(): void {
  useFinanceFixtureTenant();
  const path = join(getTenantDir(), "data/finance/chart-of-accounts.yaml");
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf-8").split("\n");
  if (lines.some((line) => line.includes("bs_class:"))) return;
  const out: string[] = [];
  let code: string | null = null;
  for (const line of lines) {
    const match = line.match(/code: "(\d{4})"/);
    if (match) code = match[1] ?? null;
    out.push(line);
    if (!line.startsWith("    type:")) continue;
    const role = code ? STATEMENT_ROLES[code] : undefined;
    if (!role) continue;
    if (role[0]) out.push(`    bs_class: ${role[0]}`);
    out.push(`    cf_role: ${role[1]}`);
    code = null;
  }
  writeFileSync(path, out.join("\n"));
}
