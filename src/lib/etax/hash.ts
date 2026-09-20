import { createHash } from "node:crypto";

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

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${sha256Hex(value)}`;
}

export function hashReturnPackageContent(input: {
  taxpayerId: string;
  procedureCode: string;
  taxYear: string;
  revision: number;
  payload: unknown;
  sourceReferences: unknown;
  specVersion: string;
}): `sha256:${string}` {
  return sha256Digest(
    canonicalizeJson({
      taxpayerId: input.taxpayerId,
      procedureCode: input.procedureCode,
      taxYear: input.taxYear,
      revision: input.revision,
      payload: input.payload,
      sourceReferences: input.sourceReferences,
      specVersion: input.specVersion,
    }),
  );
}

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
