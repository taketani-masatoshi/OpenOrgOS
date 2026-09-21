import {
  returnPackageCreateInputSchema,
  returnPackageSchema,
  type ReturnPackage,
  type ReturnPackageCreateInput,
} from "../../../schemas/etax/return-package.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getClock, getIdGenerator } from "../runtime-context.js";
import { hashReturnPackageContent } from "./hash.js";
import { currentEtaxSpecVersion } from "./spec-registry.js";
import { ETAX_SPEC_FAMILY } from "./constants.js";

export function createReturnPackage(
  raw: ReturnPackageCreateInput,
  opts?: { now?: string; id?: string },
): ReturnPackage {
  const input = returnPackageCreateInputSchema.parse(raw);
  const specVersion = input.specVersion ?? currentEtaxSpecVersion();
  const createdAt = opts?.now ?? getClock().now().toISOString();
  const id = opts?.id ?? getIdGenerator().uniqueId("ETAX-PKG");
  const contentHash = hashReturnPackageContent({
    taxpayerId: input.taxpayerId,
    procedureCode: input.procedureCode,
    taxYear: input.taxYear,
    revision: input.revision ?? 0,
    payload: input.payload,
    sourceReferences: input.sourceReferences ?? [],
    specVersion,
  });
  return returnPackageSchema.parse({
    id,
    taxpayerId: input.taxpayerId,
    procedureCode: input.procedureCode,
    taxYear: input.taxYear,
    revision: input.revision ?? 0,
    payload: input.payload,
    createdAt,
    createdBy: input.createdBy,
    contentHash,
    sourceReferences: input.sourceReferences ?? [],
    specFamily: ETAX_SPEC_FAMILY,
    specVersion,
  });
}

export function recomputeContentHash(pkg: ReturnPackage): ReturnPackage["contentHash"] {
  return hashReturnPackageContent({
    taxpayerId: pkg.taxpayerId,
    procedureCode: pkg.procedureCode,
    taxYear: pkg.taxYear,
    revision: pkg.revision,
    payload: pkg.payload,
    sourceReferences: pkg.sourceReferences,
    specVersion: pkg.specVersion,
  });
}

export function assertContentHash(pkg: ReturnPackage): void {
  const expected = recomputeContentHash(pkg);
  if (expected !== pkg.contentHash) {
    throw etaxError({
      code: "ETAX_CONTENT_HASH_MISMATCH",
      field: "contentHash",
      rule: "content-hash",
      specVersion: pkg.specVersion,
      blocked: "HASH_MISMATCH",
      message: "ReturnPackage contentHash no longer matches canonical content",
    });
  }
}

export function withMutatedPayload(pkg: ReturnPackage, payload: unknown): ReturnPackage {
  const next = createReturnPackage({
    taxpayerId: pkg.taxpayerId,
    procedureCode: pkg.procedureCode,
    taxYear: pkg.taxYear,
    revision: pkg.revision,
    payload,
    createdBy: pkg.createdBy,
    sourceReferences: pkg.sourceReferences,
    specVersion: pkg.specVersion,
  }, { id: pkg.id, now: pkg.createdAt });
  return next;
}
