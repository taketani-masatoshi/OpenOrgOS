import { createHash } from "node:crypto";
import type { FilingKind } from "../../../schemas/efiling/filing.js";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const next = obj[key];
      if (next === undefined) continue;
      out[key] = sortValue(next);
    }
    return out;
  }
  return value;
}

export function canonicalizeFilingJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function filingSha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function filingSha256Digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${filingSha256Hex(value)}`;
}

export function hashFilingContent(input: {
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
  return filingSha256Digest(
    canonicalizeFilingJson({
      taxpayerId: input.taxpayerId,
      procedureCode: input.procedureCode,
      taxYear: input.taxYear,
      revision: input.revision,
      payload: input.payload,
      sourceReferences: input.sourceReferences,
      specVersion: input.specVersion,
      filingKind: input.filingKind ?? "original",
      priorReceiptNumber: input.priorReceiptNumber ?? null,
    }),
  );
}

export function filingSlotKey(input: {
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
}): string {
  return filingSha256Hex(
    [input.taxpayerId, input.procedureCode, input.taxYear, String(input.revision)].join("|"),
  );
}
