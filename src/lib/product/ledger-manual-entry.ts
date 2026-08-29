/**
 * Minimal two-line manual journal for Workbench / onboarding.
 */
import { appendJournalEntry } from "../finance/expense-claim-journal.js";
import { loadChartOfAccounts } from "../data.js";
import { getClock } from "../runtime-context.js";

export type ManualJournalLineInput = {
  account_code: string;
  debit_yen: number;
  credit_yen: number;
};

export function listLedgerAccountsForUi(): Array<{
  code: string;
  name: string;
  type: string;
}> {
  return loadChartOfAccounts().accounts.map((row) => ({
    code: row.code,
    name: row.name,
    type: row.type,
  }));
}

export function postManualJournalEntry(input: {
  description: string;
  occurredAt?: string;
  debitAccount: string;
  creditAccount: string;
  amountYen: number;
  authorizedBy: string;
}): { entry_id: string } {
  const amount = input.amountYen;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount_yen must be positive");
  }
  const debit = input.debitAccount.trim();
  const credit = input.creditAccount.trim();
  if (!debit || !credit) {
    throw new Error("debit and credit account codes are required");
  }
  if (debit === credit) {
    throw new Error("debit and credit accounts must differ");
  }
  const coa = loadChartOfAccounts();
  const codes = new Set(coa.accounts.map((a) => a.code));
  if (!codes.has(debit) || !codes.has(credit)) {
    throw new Error("unknown account code — check chart of accounts");
  }
  const description = input.description.trim();
  if (!description) throw new Error("description is required");

  const occurredAt = input.occurredAt?.trim() || getClock().now().toISOString();
  const stamp = occurredAt.slice(0, 10).replace(/-/g, "");
  const entryId = `JE-MANUAL-${stamp}-${String(Date.now()).slice(-8)}`;

  appendJournalEntry(
    {
      entry_id: entryId,
      occurred_at: occurredAt,
      description,
      source: {
        kind: "manual",
        authorized_by: input.authorizedBy,
      },
      evidence_refs: ["manual-entry-ui"],
      lines: [
        {
          account_code: debit,
          debit_yen: amount,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: credit,
          debit_yen: 0,
          credit_yen: amount,
          tax_category: "out_of_scope",
        },
      ],
    },
    { postedBy: input.authorizedBy },
  );

  return { entry_id: entryId };
}

/** Build a proposal object for MCP / AI (does not post). */
export function proposeManualJournalEntry(input: {
  description: string;
  debitAccount: string;
  creditAccount: string;
  amountYen: number;
  occurredAt?: string;
}): {
  proposal: {
    description: string;
    debit_account: string;
    credit_account: string;
    amount_yen: number;
    occurred_at: string;
  };
  note: string;
} {
  return {
    proposal: {
      description: input.description,
      debit_account: input.debitAccount,
      credit_account: input.creditAccount,
      amount_yen: input.amountYen,
      occurred_at: input.occurredAt ?? getClock().now().toISOString(),
    },
    note: "Proposal only — enqueue via MCP/API and approve in Workbench (does not post).",
  };
}
