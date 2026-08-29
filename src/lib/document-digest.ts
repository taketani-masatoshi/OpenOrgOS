/**
 * Content digests for documents and containers.
 * Path: src/lib/document-digest.ts
 *
 * SHA-256 hex is the ledger-facing form everywhere (contracts, ASiC-E, receipts).
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export type DocumentDigest = {
  content_digest: string;
  byte_length: number;
};

export function digestBytes(bytes: Buffer | Uint8Array): DocumentDigest {
  return {
    content_digest: createHash("sha256").update(bytes).digest("hex"),
    byte_length: bytes.byteLength,
  };
}

export function digestDocumentFile(path: string): DocumentDigest {
  return digestBytes(readFileSync(path));
}

export function digestFile(path: string): string {
  return digestDocumentFile(path).content_digest;
}

export function fileByteLength(path: string): number {
  return statSync(path).size;
}
