import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import type { EtaxEnvironment, EtaxSubmissionStatus } from "../../../schemas/etax/submission-state.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getIdGenerator } from "../runtime-context.js";
import { createReturnPackage, assertContentHash, recomputeContentHash } from "./return-package.js";
import {
  identityKeyFor,
  findSubmissionByIdentity,
  loadSubmissions,
  saveReturnPackage,
  saveSubmission,
  requireReturnPackage,
  requireSubmission,
  type EtaxSubmissionRecord,
} from "./store.js";
import { invalidateAfterContentChange, transitionStatus } from "./state-machine.js";
import { appendEtaxAudit } from "./audit.js";
import { assertProcedureAllowed } from "./procedures.js";
import { assertProductionSubmitAllowed } from "./production-gate.js";
import { generateOfficialXml } from "./xml-generator.js";
import type { ReturnPackageCreateInput } from "../../../schemas/etax/return-package.js";
import type { EtaxProcedureMatrix } from "../../../schemas/etax/procedures.js";

export function buildReturnPackage(
  input: ReturnPackageCreateInput,
  opts?: { persist?: boolean; actor?: string; procedureMatrix?: EtaxProcedureMatrix },
): ReturnPackage {
  assertProcedureAllowed(input.procedureCode, "mock", opts?.procedureMatrix);
  const pkg = createReturnPackage(input);
  if (opts?.persist === false) return pkg;
  saveReturnPackage(pkg);
  const sub: EtaxSubmissionRecord = {
    id: getIdGenerator().uniqueId("ETAX-SUB"),
    packageId: pkg.id,
    status: "DRAFT",
    contentHash: pkg.contentHash,
    identityKey: identityKeyFor(pkg, pkg.contentHash),
    specVersion: pkg.specVersion,
  };
  const dup = findSubmissionByIdentity(sub.identityKey);
  if (dup && dup.status !== "DRAFT" && dup.status !== "REJECTED_BY_ETAX") {
    throw etaxError({
      code: "ETAX_DUPLICATE_SUBMISSION",
      blocked: "DUPLICATE_SUBMISSION",
      message: `Identical submission identity already exists as ${dup.id}`,
    });
  }
  saveSubmission(sub);
  appendEtaxAudit({
    actor: opts?.actor ?? input.createdBy,
    action: "ETAX_PACKAGE_CREATED",
    objectId: pkg.id,
    contentHash: pkg.contentHash,
    specVersion: pkg.specVersion,
    result: "ok",
  });
  return pkg;
}

export function submissionForPackage(packageId: string): EtaxSubmissionRecord {
  const pkg = requireReturnPackage(packageId);
  const found = loadSubmissions().find((row) => row.packageId === packageId);
  if (!found) {
    throw etaxError({
      code: "ETAX_SUBMISSION_NOT_FOUND",
      field: "packageId",
      message: `No submission for package ${packageId}`,
    });
  }
  assertBoundHash(pkg, found);
  return found;
}

export function assertBoundHash(pkg: ReturnPackage, sub: EtaxSubmissionRecord): void {
  assertContentHash(pkg);
  const live = recomputeContentHash(pkg);
  if (sub.contentHash !== live) {
    throw etaxError({
      code: "ETAX_CONTENT_HASH_MISMATCH",
      field: "contentHash",
      blocked: "HASH_MISMATCH",
      specVersion: pkg.specVersion,
      message: "Submission contentHash is stale; approval/signature/readiness are invalid",
    });
  }
  if (sub.approvalContentHash && sub.approvalContentHash !== live) {
    throw etaxError({
      code: "ETAX_APPROVAL_HASH_MISMATCH",
      field: "approvalContentHash",
      blocked: "HASH_MISMATCH",
      message: "Approval was bound to a previous contentHash",
    });
  }
}

export function applyContentMutation(
  packageId: string,
  payload: unknown,
  actor: string,
): { package: ReturnPackage; submission: EtaxSubmissionRecord } {
  const pkg = requireReturnPackage(packageId);
  const sub = submissionForPackage(packageId);
  const nextPkg = createReturnPackage({
    taxpayerId: pkg.taxpayerId,
    procedureCode: pkg.procedureCode,
    taxYear: pkg.taxYear,
    revision: pkg.revision,
    payload,
    createdBy: pkg.createdBy,
    sourceReferences: pkg.sourceReferences,
    specVersion: pkg.specVersion,
  }, { id: pkg.id, now: pkg.createdAt });
  const nextStatus = invalidateAfterContentChange(sub.status);
  const nextSub: EtaxSubmissionRecord = {
    ...sub,
    status: nextStatus,
    contentHash: nextPkg.contentHash,
    xmlHash: undefined,
    approvalId: undefined,
    approvalContentHash: undefined,
    signatureRef: undefined,
    identityKey: identityKeyFor(nextPkg, nextPkg.contentHash),
  };
  saveReturnPackage(nextPkg);
  saveSubmission(nextSub);
  appendEtaxAudit({
    actor,
    action: "ETAX_APPROVAL_INVALIDATED",
    objectId: sub.id,
    contentHash: nextPkg.contentHash,
    specVersion: nextPkg.specVersion,
    result: "ok",
    detail: `status ${sub.status} → ${nextStatus}`,
  });
  return { package: nextPkg, submission: nextSub };
}

export function buildOfficialXml(packageId: string): never {
  const pkg = requireReturnPackage(packageId);
  generateOfficialXml(pkg);
}

export function requestProductionSubmit(opts: {
  submissionId: string;
  env: EtaxEnvironment;
}): never {
  assertProductionSubmitAllowed(opts.env);
  requireSubmission(opts.submissionId);
  throw etaxError({
    code: "ETAX_SUBMIT_PHASE_BLOCKED",
    blocked: "PHASE_NOT_IMPLEMENTED",
    message: "NTA transport is not certified. Production remains disabled.",
  });
}

export function transitionSubmission(
  submissionId: string,
  to: EtaxSubmissionStatus,
): EtaxSubmissionRecord {
  const sub = requireSubmission(submissionId);
  const next = { ...sub, status: transitionStatus(sub.status, to) };
  saveSubmission(next);
  return next;
}
