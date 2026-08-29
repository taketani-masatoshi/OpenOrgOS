import {
  journalEntrySchema,
  normalizeJournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import { loadChartOfAccounts, loadFixedAssets } from "../../data.js";
import { loadJournalEntries } from "../expense-claim-journal.js";
import { buildTrialBalance } from "./trial-balance.js";

export type SubsidiaryLedgerLine = {
  counterparty_id: string;
  account_code: string;
  balance_yen: number;
  oldest_occurred_at?: string;
  days_outstanding?: number;
};

export type SubsidiaryLedgerReport = {
  account_code: string;
  account_name: string;
  lines: SubsidiaryLedgerLine[];
  control_balance_yen: number;
  subsidiary_total_yen: number;
  balanced: boolean;
};

const DEFAULT_CONTROL_ACCOUNTS = ["1150", "2110"];

export function buildSubsidiaryLedger(input: {
  accountCode: string;
  asOf?: string;
}): SubsidiaryLedgerReport {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const coa = loadChartOfAccounts();
  const account = coa.accounts.find((a) => a.code === input.accountCode);
  if (!account) {
    throw new Error(`Unknown account code: ${input.accountCode}`);
  }

  const byCounterparty = new Map<string, { balance: number; oldest?: string }>();
  for (const raw of loadJournalEntries().entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    if (entry.occurred_at.slice(0, 10) > asOf) continue;
    for (const line of entry.lines) {
      if (line.account_code !== input.accountCode) continue;
      const cp = line.counterparty_id ?? "_unassigned";
      const delta =
        account.normal_balance === "debit"
          ? line.debit_yen - line.credit_yen
          : line.credit_yen - line.debit_yen;
      const bucket = byCounterparty.get(cp) ?? { balance: 0 };
      bucket.balance += delta;
      const date = entry.occurred_at.slice(0, 10);
      if (!bucket.oldest || date < bucket.oldest) bucket.oldest = date;
      byCounterparty.set(cp, bucket);
    }
  }

  const lines: SubsidiaryLedgerLine[] = [...byCounterparty.entries()].map(
    ([counterparty_id, row]) => ({
      counterparty_id,
      account_code: input.accountCode,
      balance_yen: row.balance,
      oldest_occurred_at: row.oldest,
      days_outstanding: row.oldest
        ? Math.max(
            0,
            Math.ceil(
              (new Date(asOf).getTime() - new Date(row.oldest).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : undefined,
    }),
  );

  const subsidiary_total_yen = lines.reduce((s, l) => s + l.balance_yen, 0);
  const trial = buildTrialBalance({ asOf, coa });
  const control_balance_yen =
    trial.rows.find((row) => row.account_code === input.accountCode)?.balance_yen ?? 0;

  return {
    account_code: input.accountCode,
    account_name: account.name,
    lines,
    control_balance_yen,
    subsidiary_total_yen,
    balanced: control_balance_yen === subsidiary_total_yen,
  };
}

export function buildFixedAssetSubsidiaryLedger(): Array<{
  asset_id: string;
  name: string;
  book_value_yen: number;
}> {
  const fa = loadFixedAssets();
  return fa.assets.map((asset) => ({
    asset_id: asset.id,
    name: asset.name,
    book_value_yen: asset.book_value ?? 0,
  }));
}

export function subsidiaryLedgerIntegrityIssues(asOf?: string): string[] {
  const issues: string[] = [];
  const coa = loadChartOfAccounts();
  const codes = DEFAULT_CONTROL_ACCOUNTS.filter((code) =>
    coa.accounts.some((account) => account.code === code),
  );
  for (const accountCode of codes) {
    const report = buildSubsidiaryLedger({ accountCode, asOf });
    if (!report.balanced) {
      issues.push(
        `${report.account_code}: control ${report.control_balance_yen} != subsidiary ${report.subsidiary_total_yen}`,
      );
    }
    for (const line of report.lines) {
      if (line.counterparty_id === "_unassigned" && line.balance_yen !== 0) {
        issues.push(
          `${report.account_code}: unassigned counterparty balance ${line.balance_yen}`,
        );
      }
    }
  }
  return issues;
}
