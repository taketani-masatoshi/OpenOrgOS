/**
 * First journal entry for onboarding — COA-safe, does not require monthly-pl YAML.
 */
import { appendJournalEntry, loadJournalEntries } from "../finance/expense-claim-journal.js";
import { getClock } from "../runtime-context.js";
import {
  ensureLedgerDemoChartOfAccounts,
  resolveDemoYearAccountCodes,
} from "./ledger-coa-ensure.js";

export function postFirstOnboardingJournal(input?: {
  amountYen?: number;
  description?: string;
  authorizedBy?: string;
  force?: boolean;
}): {
  entry_id: string | null;
  skipped: boolean;
  reason?: string;
} {
  const existing = loadJournalEntries().entries;
  if (existing.length > 0 && !input?.force) {
    return {
      entry_id: null,
      skipped: true,
      reason: "journals already present",
    };
  }

  ensureLedgerDemoChartOfAccounts();
  const codes = resolveDemoYearAccountCodes();
  const amount = input?.amountYen ?? 100_000;
  const now = getClock().now();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const entryId = `JE-ONBOARD-FIRST-${period}`;

  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: now.toISOString(),
      description:
        input?.description ??
        "初回仕訳（オンボーディング）— 現金及び預金 / 売上",
      source: {
        kind: "closing",
        period,
        adjustment_id: "onboard-first",
      },
      evidence_refs: ["onboarding-first-journal"],
      lines: [
        {
          account_code: codes.bank_control,
          debit_yen: amount,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: codes.revenue,
          debit_yen: 0,
          credit_yen: amount,
          tax_category: "out_of_scope",
        },
      ],
    },
    { postedBy: input?.authorizedBy ?? "onboarding-first-journal" },
  );

  return { entry_id: entryId, skipped: false };
}
