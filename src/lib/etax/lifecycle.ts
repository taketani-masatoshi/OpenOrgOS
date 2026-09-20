import type { ReturnPackage } from "../../../schemas/etax/return-package.js";
import type {
  EtaxEnvironment,
  EtaxSubmissionStatus,
} from "../../../schemas/etax/submission-state.js";
import type { EtaxSignatureProviderId } from "../../../schemas/etax/signature.js";
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
import { assertProductionSubmitAllowed } from "./production-gate.js";
import { generateOfficialXml } from "./xml-generator.js";
import { bindSignatureToSubmission, signDocument, xmlHashOf } from "./signature.js";
import type { SignatureResult } from "./adapters.js";
import type { ReturnPackageCreateInput } from "../../../schemas/etax/return-package.js";
import type { EtaxProcedureMatrix } from "../../../schemas/etax/procedures.js";

export function buildReturnPackage(
  input: ReturnPackageCreateInput,
  opts?: { persist?: boolean; actor?: string; procedureMatrix?: EtaxProcedureMatrix }
): ReturnPackage {
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
  actor: string
): { package: ReturnPackage; submission: EtaxSubmissionRecord } {
  const pkg = requireReturnPackage(packageId);
  const sub = submissionForPackage(packageId);
  const nextPkg = createReturnPackage(
    {
      taxpayerId: pkg.taxpayerId,
      procedureCode: pkg.procedureCode,
      taxYear: pkg.taxYear,
      revision: pkg.revision,
      payload,
      createdBy: pkg.createdBy,
      sourceReferences: pkg.sourceReferences,
      specVersion: pkg.specVersion,
    },
    { id: pkg.id, now: pkg.createdAt }
  );
  const nextStatus = invalidateAfterContentChange(sub.status);
  const nextSub: EtaxSubmissionRecord = {
    ...sub,
    status: nextStatus,
    contentHash: nextPkg.contentHash,
    xmlHash: undefined,
    approvalId: undefined,
    approvalContentHash: undefined,
    signatureRef: undefined,
    signatureProvider: undefined,
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
  submissionForPackage(packageId);
  generateOfficialXml(pkg);
}

export async function signSubmission(opts: {
  submissionId: string;
  env: EtaxEnvironment;
  provider?: EtaxSignatureProviderId;
  document: Buffer;
  actor: string;
  persist?: boolean;
}): Promise<{ submission: EtaxSubmissionRecord; signature: SignatureResult }> {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  if (!sub.xmlHash) {
    throw etaxError({
      code: "ETAX_SIGN_NO_XML",
      field: "xmlHash",
      blocked: "SPEC_BLOCKED",
      message: "Official XML is not bound (xmlHash missing). Cannot sign.",
    });
  }
  const liveXml = xmlHashOf(opts.document);
  if (liveXml !== sub.xmlHash) {
    throw etaxError({
      code: "ETAX_SIGNATURE_XML_HASH_MISMATCH",
      field: "xmlHash",
      blocked: "HASH_MISMATCH",
      message: "Provided XML does not match the submission xmlHash",
    });
  }
  const signature = await signDocument({
    env: opts.env,
    provider: opts.provider,
    document: opts.document,
    documentHash: sub.xmlHash,
  });
  const next = bindSignatureToSubmission(sub, signature, opts.env);
  if (opts.persist !== false) {
    saveSubmission(next);
    appendEtaxAudit({
      actor: opts.actor,
      action: "ETAX_SIGNATURE_CREATED",
      objectId: next.id,
      contentHash: next.contentHash,
      specVersion: next.specVersion,
      result: "ok",
      detail: `provider=${signature.provider} legal=${signature.legal} method=${signature.method ?? "unknown"}`,
    });
  }
  return { submission: next, signature };
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
  to: EtaxSubmissionStatus
): EtaxSubmissionRecord {
  const sub = requireSubmission(submissionId);
  const next = { ...sub, status: transitionStatus(sub.status, to) };
  saveSubmission(next);
  return next;
}
