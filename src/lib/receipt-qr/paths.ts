/**
 * Receipt QR file locations under the tenant `data/receipt-qr/`.
 * Path: src/lib/receipt-qr/paths.ts
 */
import { join } from "node:path";
import { getDataDir } from "../utils.js";

export const RECEIPT_DATA_DIRNAME = "receipt-qr";

export function receiptDataDir(): string {
  return join(getDataDir(), RECEIPT_DATA_DIRNAME);
}

export function receiptRegistryPath(): string {
  return join(receiptDataDir(), "receipts.yaml");
}

export function receiptConfigPath(): string {
  return join(receiptDataDir(), "config.yaml");
}

export function receiptEventsDir(): string {
  return join(receiptDataDir(), "events");
}

export function receiptSnapshotDir(): string {
  return join(receiptDataDir(), "snapshots");
}

export function receiptIssuedDir(): string {
  return join(receiptDataDir(), "issued");
}
