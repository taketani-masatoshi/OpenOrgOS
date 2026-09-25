import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { filingError } from "./errors.js";
import { filingSha256Digest } from "./hash.js";

export type FilingEvidence = {
  xmlPath?: string;
  xmlSha256?: string;
  signaturePath?: string;
  signatureSha256?: string;
  xtxPath?: string;
  xtxSha256?: string;
  attachments?: Array<{ path: string; sha256: string }>;
  status: string;
};

function sha256File(path: string): `sha256:${string}` {
  return filingSha256Digest(readFileSync(path));
}

function assertFileHash(
  path: string | undefined,
  expected: string | undefined,
  label: string
): string[] {
  if (!path && !expected) return [];
  if (!path || !expected) return [`${label} path and hash must both be present`];
  if (!existsSync(path)) return [`${label} file is missing`];
  const actual = sha256File(path);
  if (actual !== expected) return [`${label} hash mismatch`];
  return [];
}

export function verifyFilingEvidence(record: FilingEvidence): { ok: boolean; errors: string[] } {
  const errors = [
    ...assertFileHash(record.xmlPath, record.xmlSha256, "xml"),
    ...assertFileHash(record.signaturePath, record.signatureSha256, "signature"),
    ...assertFileHash(record.xtxPath, record.xtxSha256, "xtx"),
  ];
  for (const attachment of record.attachments ?? []) {
    errors.push(...assertFileHash(attachment.path, attachment.sha256, "attachment"));
  }
  if (
    (record.status === "RECEIVED_BY_ETAX" || record.status === "REJECTED_BY_ETAX") &&
    !record.xtxSha256
  ) {
    errors.push("terminal filing requires a receipt xtx hash");
  }
  return { ok: errors.length === 0, errors };
}

export function sha256OfBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertEvidenceUnchanged(before: string, after: string, label: string): void {
  if (before !== after) {
    throw filingError("EFILING_EVIDENCE_CHANGED", `${label} hash changed after sealing`);
  }
}
