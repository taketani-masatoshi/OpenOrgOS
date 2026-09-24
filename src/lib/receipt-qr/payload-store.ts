/**
 * Verified signed receipt payloads on disk.
 * Path: src/lib/receipt-qr/payload-store.ts
 *
 * `issued/` — issuer copy (includes claim_key, 0600) used to regenerate PDFs.
 * `snapshots/` — claimant copy ingested from a QR link or online fetch.
 * Both are re-verified on read; an invalid file reads as missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { getDataDir } from "../utils.js";
import {
  RECEIPT_DATA_DIRNAME,
  receiptIssuedDir,
  receiptSnapshotDir,
} from "./paths.js";
import { verifySignedReceiptPayload } from "./signature.js";

const ISSUED_PAYLOAD_FILE_MODE = 0o600;

function writeVerifiedPayload(
  payload: SignedReceiptQrPayload,
  target: { dir: string; subdir: string; invalidPrefix: string; mode?: number },
): string {
  const verified = verifySignedReceiptPayload(payload);
  if (!verified.ok || !verified.payload) {
    throw new Error(`${target.invalidPrefix}: ${verified.reason}`);
  }
  mkdirSync(target.dir, { recursive: true });
  const relative = `${RECEIPT_DATA_DIRNAME}/${target.subdir}/${verified.payload.receipt.receipt_id}.json`;
  writeFileSync(
    join(getDataDir(), relative),
    `${JSON.stringify(verified.payload, null, 2)}\n`,
    target.mode === undefined
      ? "utf-8"
      : { encoding: "utf-8", mode: target.mode },
  );
  return relative;
}

function readVerifiedPayload(absolute: string): SignedReceiptQrPayload | undefined {
  if (!existsSync(absolute)) return undefined;
  const raw = JSON.parse(readFileSync(absolute, "utf-8")) as unknown;
  const verified = verifySignedReceiptPayload(raw);
  return verified.ok ? verified.payload : undefined;
}

export function saveVerifiedReceiptSnapshot(
  payload: SignedReceiptQrPayload,
): string {
  return writeVerifiedPayload(payload, {
    dir: receiptSnapshotDir(),
    subdir: "snapshots",
    invalidPrefix: "Receipt verification failed",
  });
}

export function loadReceiptSnapshot(
  relativePath: string,
): SignedReceiptQrPayload | undefined {
  return readVerifiedPayload(join(getDataDir(), relativePath));
}

export function saveIssuedReceiptPayload(
  payload: SignedReceiptQrPayload,
): string {
  return writeVerifiedPayload(payload, {
    dir: receiptIssuedDir(),
    subdir: "issued",
    invalidPrefix: "Issued receipt invalid",
    mode: ISSUED_PAYLOAD_FILE_MODE,
  });
}

export function loadIssuedReceiptPayload(
  receiptId: string,
): SignedReceiptQrPayload | undefined {
  return readVerifiedPayload(join(receiptIssuedDir(), `${receiptId}.json`));
}

/**
 * Prefer issued snapshot (includes claim_key); fall back to claimant snapshot.
 */
export function loadSignedReceiptForPdf(
  receiptId: string,
): SignedReceiptQrPayload {
  const issued = loadIssuedReceiptPayload(receiptId);
  if (issued) return issued;
  const snap = loadReceiptSnapshot(`${RECEIPT_DATA_DIRNAME}/snapshots/${receiptId}.json`);
  if (snap) return snap;
  throw new Error(
    `Signed receipt payload not found for ${receiptId} (issued or snapshot)`,
  );
}
