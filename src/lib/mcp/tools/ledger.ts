import { jsonResult, type McpToolResult } from "../result.js";

export async function handleLedgerToday(
  _args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { buildMonthCloseChecklist } = await import(
    "../../product/ledger-month-close-checklist.js"
  );
  const { listBankReconciliationWorkbench } = await import(
    "../../finance/bank-reconcile-apply.js"
  );
  const { loadJournalEntries } = await import("../../finance/expense-claim-journal.js");
  const checklist = buildMonthCloseChecklist();
  const bank = listBankReconciliationWorkbench();
  const journals = loadJournalEntries().entries.length;
  return jsonResult({
    journal_count: journals,
    bank_unmatched: bank.unmatched_count,
    proposals: bank.proposals.slice(0, 8),
    month_close: checklist,
    note: "Read-only. Approve writes in Workbench /?ledger=1",
  });
}

export async function handleLedgerTrialBalance(
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { buildTrialBalance } = await import("../../finance/ledger/trial-balance.js");
  const asOf =
    typeof args.as_of === "string" && args.as_of.trim()
      ? args.as_of.trim()
      : new Date().toISOString().slice(0, 10);
  const tb = buildTrialBalance({ asOf });
  return jsonResult({
    as_of: asOf,
    balanced: tb.balanced,
    debit_total_yen: tb.debit_total_yen,
    credit_total_yen: tb.credit_total_yen,
    rows: tb.rows.slice(0, 40),
  });
}

export async function handleLedgerProposeManualEntry(
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { enqueueManualJournalProposal } = await import(
    "../../product/ledger-proposal-queue.js"
  );
  const proposal = enqueueManualJournalProposal({
    description: String(args.description ?? ""),
    debitAccount: String(args.debit_account ?? ""),
    creditAccount: String(args.credit_account ?? ""),
    amountYen: Number(args.amount_yen),
    occurredAt:
      typeof args.occurred_at === "string" ? args.occurred_at : undefined,
    source: "mcp",
    note: "MCP proposal — approve in Workbench",
  });
  return jsonResult({
    queued: true,
    proposal,
    note: "Queued for Workbench approval — MCP did not post a journal",
  });
}

export async function handleLedgerProposeBankMatch(
  _args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { listBankReconciliationWorkbench } = await import(
    "../../finance/bank-reconcile-apply.js"
  );
  const workbench = listBankReconciliationWorkbench();
  return jsonResult({
    unmatched_count: workbench.unmatched_count,
    proposals: workbench.proposals,
    note: "Proposal only — approve in Workbench",
  });
}
