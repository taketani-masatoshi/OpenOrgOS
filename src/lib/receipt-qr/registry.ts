/**
 * Issuer receipt ledger (`data/receipt-qr/receipts.yaml`, JSON body).
 * Path: src/lib/receipt-qr/registry.ts
 *
 * Mutations run under an exclusive lockfile (with brief retries) and write
 * via temp + rename so concurrent Chat / CLI callers serialize.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  receiptRegistrySchema,
  storedReceiptSchema,
  type ReceiptRegistry,
  type StoredReceipt,
} from "../../../schemas/receipt-qr.js";
import { currentDate, readYamlFile } from "../utils.js";
import { YamlFileBusyError, withYamlFileLock } from "../yaml-atomic.js";
import { receiptIssuedDir, receiptRegistryPath } from "./paths.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function loadReceiptRegistry(): ReceiptRegistry {
  const path = receiptRegistryPath();
  if (!existsSync(path)) return { receipts: [] };
  return readYamlFile(path, receiptRegistrySchema);
}

export function findStoredReceipt(
  receiptId: string,
): StoredReceipt | undefined {
  return loadReceiptRegistry().receipts.find(
    (row) => row.receipt.receipt_id === receiptId,
  );
}

function writeReceiptRegistryAtomic(registry: ReceiptRegistry): void {
  const path = receiptRegistryPath();
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const serialized =
    JSON.stringify({ ...registry, as_of: currentDate() }, null, 2) + "\n";
  writeFileSync(temp, serialized, { encoding: "utf-8", mode: 0o600 });
  renameSync(temp, path);
}

/** Load → mutate in place → validate → save, all under the registry lock. */
export function withRegistryLock<T>(fn: (registry: ReceiptRegistry) => T): T {
  const path = receiptRegistryPath();
  try {
    return withYamlFileLock(path, () => {
      const registry = loadReceiptRegistry();
      const result = fn(registry);
      writeReceiptRegistryAtomic(receiptRegistrySchema.parse(registry));
      return result;
    });
  } catch (error) {
    if (error instanceof YamlFileBusyError) {
      throw new Error("Receipt registry is busy; retry the operation");
    }
    throw error;
  }
}

export function requireReceiptIndex(registry: ReceiptRegistry, receiptId: string): number {
  const index = registry.receipts.findIndex(
    (row) => row.receipt.receipt_id === receiptId,
  );
  if (index < 0) throw new Error(`Receipt not found: ${receiptId}`);
  return index;
}

/** Merge a patch into one stored receipt under the lock and return the validated row. */
export function patchStoredReceipt(
  receiptId: string,
  patch: Partial<StoredReceipt>,
): StoredReceipt {
  return withRegistryLock((registry) => {
    const index = requireReceiptIndex(registry, receiptId);
    const updated = storedReceiptSchema.parse({
      ...registry.receipts[index],
      ...patch,
    });
    registry.receipts[index] = updated;
    return updated;
  });
}

export type ReceiptRegistryIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

function rowIntegrityIssues(row: StoredReceipt): Array<Omit<ReceiptRegistryIntegrityIssue, "file">> {
  const id = row.receipt.receipt_id;
  const issues: Array<Omit<ReceiptRegistryIntegrityIssue, "file">> = [];
  if (!SHA256_HEX.test(row.claim_key_hash)) {
    issues.push({ level: "error", message: `${id}: invalid claim_key_hash` });
  }
  if (!SHA256_HEX.test(row.digest)) {
    issues.push({ level: "error", message: `${id}: invalid digest` });
  }
  if (row.claim_status === "claim_pending_approval" && !row.claim_approval_id) {
    issues.push({
      level: "error",
      message: `${id}: pending claim missing claim_approval_id`,
    });
  }
  if (row.claim_status === "claim_rejected" && !row.claim_reject_reason) {
    issues.push({ level: "warning", message: `${id}: rejected claim missing reason` });
  }
  if (!existsSync(join(receiptIssuedDir(), `${id}.json`))) {
    issues.push({
      level: "warning",
      message: `${id}: issued payload missing (PDF regenerate may fail)`,
    });
  }
  return issues;
}

/** Soft integrity for `data/receipt-qr/receipts.yaml` (missing file = no issues). */
export function validateReceiptRegistryIntegrity(): ReceiptRegistryIntegrityIssue[] {
  const file = "data/receipt-qr/receipts.yaml";
  if (!existsSync(receiptRegistryPath())) return [];
  let registry: ReceiptRegistry;
  try {
    registry = loadReceiptRegistry();
  } catch (error) {
    return [
      {
        level: "error",
        file,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  const issues: ReceiptRegistryIntegrityIssue[] = [];
  const seen = new Set<string>();
  for (const row of registry.receipts) {
    if (seen.has(row.receipt.receipt_id)) {
      issues.push({
        level: "error",
        file,
        message: `duplicate receipt_id ${row.receipt.receipt_id}`,
      });
    }
    seen.add(row.receipt.receipt_id);
    for (const issue of rowIntegrityIssues(row)) {
      issues.push({ level: issue.level, file, message: issue.message });
    }
  }
  return issues;
}
