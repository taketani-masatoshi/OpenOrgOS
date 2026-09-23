/** Protocol transaction command handlers. */
import { applyProtocolTenant } from "./shared.js";
import {
  findTransaction,
  listTransactions,
} from "../../lib/protocol/core/transactions.js";
import { recordProtocolTransaction } from "../../lib/protocol/core/record-transaction.js";
import type { TransactionType } from "../../../schemas/protocol/transaction-record.js";
import { transactionTypeSchema } from "../../../schemas/protocol/transaction-record.js";


export interface ProtocolTransactionRecordOptions {
  type: string;
  contract?: string;
  peer: string;
  invoice?: string;
  brokerInstruction?: string;
  amount?: number;
  currency?: string;
  stakeholder?: string;
  notes?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionRecord(opts: ProtocolTransactionRecordOptions): void {
  applyProtocolTenant(opts.tenant);
  const parsedType = transactionTypeSchema.safeParse(opts.type);
  if (!parsedType.success) {
    console.error(`Invalid transaction type: ${opts.type}`);
    process.exit(1);
  }
  const transactionType = parsedType.data;

  if (transactionType === "steward.contract.execution.notice") {
    console.error(
      "Use `steward protocol notice propose` + `notice approve` for execution notices (operator + approver required)"
    );
    process.exit(1);
  }

  const outboundWireTypes: TransactionType[] = [
    "steward.contract.executed",
    "steward.invoice.issued",
    "steward.payment.instructed",
    "steward.obligation.acknowledged",
  ];
  if (outboundWireTypes.includes(transactionType)) {
    const legacy = opts.type;
    console.error(
      `Use \`steward protocol notice propose --type ${legacy}\` + \`notice approve\` for outbound wire`
    );
    process.exit(1);
  }

  try {
    const result = recordProtocolTransaction({
      transactionType,
      peerId: opts.peer,
      direction: "inbound",
      contractId: opts.contract,
      invoiceId: opts.invoice,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholder,
      amount:
        opts.amount != null
          ? { value: opts.amount, currency: opts.currency ?? "JPY" }
          : undefined,
      notes: opts.notes,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ ${result.transaction.transaction_id} · ${result.transaction.transaction_type}`);
    console.log(`  event_id: ${result.envelope.event_id}`);
    console.log(`  audit: ${result.auditRecordId}`);
    if (result.outboxPath) {
      console.log(`  outbox: ${result.outboxPath}`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolTransactionListOptions {
  peer?: string;
  since?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionList(opts: ProtocolTransactionListOptions): void {
  applyProtocolTenant(opts.tenant);
  const rows = listTransactions({ peerId: opts.peer, since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("No transactions.");
    return;
  }
  console.log("| id | type | peer | direction | recorded |");
  console.log("|----|------|------|-----------|----------|");
  for (const t of rows) {
    console.log(
      `| ${t.transaction_id} | ${t.transaction_type} | ${t.counterparty.org_id} | ${t.direction} | ${t.recorded_at.slice(0, 10)} |`
    );
  }
}

export interface ProtocolTransactionShowOptions {
  id: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionShow(opts: ProtocolTransactionShowOptions): void {
  applyProtocolTenant(opts.tenant);
  const tx = findTransaction(opts.id);
  if (!tx) {
    console.error(`Transaction ${opts.id} not found`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(tx, null, 2));
    return;
  }
  console.log(`# ${tx.transaction_id}`);
  console.log(`type: ${tx.transaction_type}`);
  console.log(`direction: ${tx.direction}`);
  console.log(`counterparty: ${tx.counterparty.org_id}`);
  console.log(`event_id: ${tx.event_id}`);
  if (tx.amount) console.log(`amount: ${tx.amount.value} ${tx.amount.currency}`);
  if (tx.notes) console.log(`notes: ${tx.notes}`);
}

export interface ProtocolTransactionPruneOrphansOptions {
  tenant?: string;
  peer?: string;
  since?: string;
  fetch?: boolean;
  apply?: boolean;
  json?: boolean;
}

export async function runProtocolTransactionPruneOrphans(
  opts: ProtocolTransactionPruneOrphansOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { pruneOrphanTransactions } = await import("../../lib/protocol/distribution/transaction-orphans.js");
  const result = await pruneOrphanTransactions({
    peerId: opts.peer,
    since: opts.since,
    fetchReceipts: opts.fetch === true,
    apply: opts.apply === true,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.orphans.length === 0) {
    console.log("✓ No orphan outbound transactions");
    return;
  }
  console.log(
    `${result.dry_run ? "Would remove" : "Removed"} ${result.orphans.length} orphan transaction(s):`
  );
  for (const orphan of result.orphans) {
    console.log(
      `  · ${orphan.transaction.transaction_id} · ${orphan.transaction.event_id} · ${orphan.reasons.join(", ")}`
    );
  }
  if (result.dry_run) {
    console.log("  (dry-run — pass --apply to remove from registry)");
  }
}

