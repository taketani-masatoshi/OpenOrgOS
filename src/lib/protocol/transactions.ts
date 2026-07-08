import { existsSync } from "node:fs";
import {
  transactionsRegistrySchema,
  type TransactionRecord,
  type TransactionsRegistry,
} from "../../../schemas/protocol/transaction-record.js";
import { getTransactionsRegistryPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";

export function loadTransactionsRegistry(): TransactionsRegistry {
  const path = getTransactionsRegistryPath();
  if (!existsSync(path)) {
    return { transactions: [] };
  }
  return readYamlFile(path, transactionsRegistrySchema);
}

export function saveTransactionsRegistry(registry: TransactionsRegistry): void {
  writeYamlFile(getTransactionsRegistryPath(), {
    ...registry,
    as_of: currentDate(),
  });
}

export function findTransaction(transactionId: string): TransactionRecord | undefined {
  return loadTransactionsRegistry().transactions.find((t) => t.transaction_id === transactionId);
}

export function findTransactionByEventId(eventId: string): TransactionRecord | undefined {
  return loadTransactionsRegistry().transactions.find((t) => t.event_id === eventId);
}

export function appendTransaction(record: TransactionRecord): TransactionRecord {
  const registry = loadTransactionsRegistry();
  if (registry.transactions.some((t) => t.transaction_id === record.transaction_id)) {
    throw new Error(`Transaction ${record.transaction_id} already exists`);
  }
  registry.transactions.push(record);
  saveTransactionsRegistry(registry);
  return record;
}

export function listTransactions(filter?: {
  peerId?: string;
  since?: string;
}): TransactionRecord[] {
  return loadTransactionsRegistry()
    .transactions.filter((t) => {
      if (filter?.peerId && t.counterparty.org_id !== filter.peerId) return false;
      if (filter?.since && t.recorded_at.slice(0, 10) < filter.since) return false;
      return true;
    })
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

export function nextTransactionId(date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const prefix = `TX-${ymd}-`;
  const registry = loadTransactionsRegistry();
  let max = 0;
  for (const t of registry.transactions) {
    if (t.transaction_id.startsWith(prefix)) {
      const n = Number(t.transaction_id.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
