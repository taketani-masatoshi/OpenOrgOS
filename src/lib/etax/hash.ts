import type { FilingKind } from "../../../schemas/efiling/filing.js";
import {
  canonicalizeFilingJson,
  filingSha256Digest,
  filingSha256Hex,
  filingSlotKey,
  hashFilingContent,
} from "../efiling/hash.js";

export function canonicalizeJson(value: unknown): string {
  return canonicalizeFilingJson(value);
}

export function sha256Hex(value: string | Buffer): string {
  return filingSha256Hex(value);
}

export function sha256Digest(value: string | Buffer): `sha256:${string}` {
  return filingSha256Digest(value);
}

export function hashReturnPackageContent(input: {
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
  payload: unknown;
  sourceReferences: unknown;
  specVersion: string;
  filingKind?: FilingKind;
  priorReceiptNumber?: string;
}): `sha256:${string}` {
  return hashFilingContent(input);
}

/**
 * Filing slot key (no content hash). One active submission per slot.
 * contentHash binds approval/signature/ready separately.
 */
export function submissionSlotKey(input: {
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
}): string {
  return filingSlotKey(input);
}

/** @deprecated Prefer submissionSlotKey for duplicate detection. Kept for hash-bound audits. */
export function submissionIdentityKey(input: {
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
  documentHash: string;
}): string {
  return sha256Hex(
    [
      input.taxpayerId,
      input.procedureCode,
      input.taxYear,
      String(input.revision),
      input.documentHash,
    ].join("|"),
  );
}
