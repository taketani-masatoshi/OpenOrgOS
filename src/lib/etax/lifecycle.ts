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
  findActiveSubmissionInSlot,
  loadSubmissions,
  saveReturnPackage,
  saveSubmission,
  requireReturnPackage,
  requireSubmission,
  type EtaxSubmissionRecord,
  type EtaxXmlProvenance,
} from "./store.js";
import { invalidateAfterContentChange, transitionStatus } from "./state-machine.js";
import { appendEtaxAudit } from "./audit.js";
import { assertProductionSubmitAllowed } from "./production-gate.js";
import { generateOfficialXml } from "./xml-generator.js";
import { bindSignatureToSubmission, signDocument, xmlHashOf } from "./signature.js";
import { bindApprovalToSubmission } from "./approval.js";
import { markReadyToSubmit, pullReceipt, sendSignedSubmission } from "./submit.js";
import type { SignatureResult } from "./adapters.js";
import type { ReceiptResult, SubmissionResult } from "./adapters.js";
import type { ReturnPackageCreateInput } from "../../../schemas/etax/return-package.js";
import type { EtaxProcedureMatrix } from "../../../schemas/etax/procedures.js";
import { validateEtaxDocument } from "./validate-layers.js";
import { xmlContentHash } from "./xml-validate.js";

export function buildReturnPackage(
  input: ReturnPackageCreateInput,
  opts?: { persist?: boolean; actor?: string; procedureMatrix?: EtaxProcedureMatrix },
): ReturnPackage {
  const pkg = createReturnPackage(input);
  if (opts?.persist === false) return pkg;
  saveReturnPackage(pkg);
  const slotKey = identityKeyFor(pkg);
  const dup = findActiveSubmissionInSlot(slotKey);
  if (dup) {
    throw etaxError({
      code: "ETAX_DUPLICATE_SUBMISSION",
      blocked: "DUPLICATE_SUBMISSION",
      message: `Active submission already exists for this filing slot as ${dup.id} (status=${dup.status})`,
    });
  }
  const sub: EtaxSubmissionRecord = {
    id: getIdGenerator().uniqueId("ETAX-SUB"),
    packageId: pkg.id,
    status: "DRAFT",
    contentHash: pkg.contentHash,
    identityKey: slotKey,
    specVersion: pkg.specVersion,
  };
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
  if (sub.status !== "DRAFT" && sub.status !== "GENERATED" && sub.status !== "SCHEMA_VALID" && sub.status !== "BUSINESS_RULE_VALID") {
    if (sub.status === "APPROVED" || sub.status === "SIGNED" || sub.status === "READY_TO_SUBMIT") {
      throw etaxError({
        code: "ETAX_MUTATION_REQUIRES_NEW_REVISION",
        field: "revision",
        message: `Cannot mutate ${sub.status} in place; open a new revision`,
      });
    }
  }
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
    { id: pkg.id, now: pkg.createdAt },
  );
  const nextStatus = invalidateAfterContentChange(sub.status);
  const nextSub: EtaxSubmissionRecord = {
    ...sub,
    status: nextStatus,
    contentHash: nextPkg.contentHash,
    xmlHash: undefined,
    xmlProvenance: undefined,
    approvalId: undefined,
    approvalContentHash: undefined,
    signatureRef: undefined,
    signatureProvider: undefined,
    signatureLegal: undefined,
    signatureDocumentHash: undefined,
    signatureHash: undefined,
    requestId: undefined,
    receiptNumber: undefined,
    receiptHash: undefined,
    identityKey: identityKeyFor(nextPkg),
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

export function bindOfficialXml(
  submissionId: string,
  xml: string,
  provenance: EtaxXmlProvenance,
  actor: string,
): { submission: EtaxSubmissionRecord; xmlHash: string } {
  const sub = requireSubmission(submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  if (provenance === "imported-validated" && sub.environment === "production") {
    throw etaxError({
      code: "ETAX_IMPORT_FORBIDDEN_IN_PRODUCTION",
      blocked: "PRODUCTION_DISABLED",
      message: "imported-validated XML cannot bind a production submission",
    });
  }
  const hash = xmlContentHash(xml);
  let status = sub.status;
  if (status === "DRAFT") {
    status = transitionStatus("DRAFT", "GENERATED");
  } else if (status !== "GENERATED" && status !== "SCHEMA_VALID" && status !== "BUSINESS_RULE_VALID") {
    throw etaxError({
      code: "ETAX_BIND_XML_BAD_STATUS",
      field: "status",
      message: `Cannot bind XML in status ${sub.status}`,
    });
  }
  const next: EtaxSubmissionRecord = {
    ...sub,
    status,
    xmlHash: hash,
    xmlProvenance: provenance,
  };
  saveSubmission(next);
  appendEtaxAudit({
    actor,
    action: "ETAX_XML_GENERATED",
    objectId: next.id,
    contentHash: next.contentHash,
    specVersion: next.specVersion,
    result: "ok",
    detail: `provenance=${provenance} xmlHash=${hash}`,
  });
  return { submission: next, xmlHash: hash };
}

export function buildOfficialXml(
  packageId: string,
  opts?: { persist?: boolean; actor?: string },
): { xml: string; submission: EtaxSubmissionRecord; xmlHash: string } {
  const pkg = requireReturnPackage(packageId);
  const sub = submissionForPackage(packageId);
  const xml = generateOfficialXml(pkg);
  if (opts?.persist === false) {
    return { xml, submission: sub, xmlHash: xmlContentHash(xml) };
  }
  const bound = bindOfficialXml(sub.id, xml, "generated", opts?.actor ?? "system");
  return { xml, submission: bound.submission, xmlHash: bound.xmlHash };
}

/**
 * Validate XML and advance GENERATED → SCHEMA_VALID → BUSINESS_RULE_VALID when all layers pass.
 */
export function validateAndAdvance(opts: {
  submissionId: string;
  xml: string;
  env?: EtaxEnvironment;
  actor: string;
  persist?: boolean;
}): { report: ReturnType<typeof validateEtaxDocument>; submission: EtaxSubmissionRecord } {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  if (!sub.xmlHash) {
    throw etaxError({
      code: "ETAX_VALIDATE_NO_XML",
      field: "xmlHash",
      blocked: "SPEC_BLOCKED",
      message: "Bind official XML before validateAndAdvance",
    });
  }
  const liveHash = xmlContentHash(opts.xml);
  if (liveHash !== sub.xmlHash) {
    throw etaxError({
      code: "ETAX_XML_HASH_MISMATCH",
      blocked: "HASH_MISMATCH",
      message: "Validate XML does not match bound xmlHash",
    });
  }
  const report = validateEtaxDocument({
    pkg,
    submission: sub,
    env: opts.env ?? "mock",
    xml: opts.xml,
  });
  let next = sub;
  if (report.ok) {
    const status = statusAfterSuccessfulValidation(sub.status);
    next = { ...sub, status };
    if (opts.persist !== false) {
      saveSubmission(next);
      appendEtaxAudit({
        actor: opts.actor,
        action: "ETAX_VALIDATION_COMPLETED",
        objectId: next.id,
        contentHash: next.contentHash,
        specVersion: next.specVersion,
        result: "ok",
        detail: `status=${next.status}`,
      });
    }
  }
  return { report, submission: next };
}

/** Pure status advance used by validateAndAdvance when all layers pass. */
export function statusAfterSuccessfulValidation(
  from: EtaxSubmissionStatus,
): EtaxSubmissionStatus {
  let status = from;
  if (status === "GENERATED") status = transitionStatus(status, "SCHEMA_VALID");
  if (status === "SCHEMA_VALID") status = transitionStatus(status, "BUSINESS_RULE_VALID");
  return status;
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

function signatureFromSubmission(sub: EtaxSubmissionRecord): SignatureResult {
  if (!sub.signatureRef || !sub.signatureProvider || !sub.signatureHash) {
    throw etaxError({
      code: "ETAX_SUBMIT_NO_SIGNATURE",
      field: "signatureRef",
      message: "Cannot submit without a bound signatureRef",
    });
  }
  return {
    provider: sub.signatureProvider,
    legal: sub.signatureLegal ?? false,
    certificateId:
      sub.signatureProvider === "mock"
        ? "orgos-mock-not-an-nta-certificate"
        : "nta-official-certificate-ref",
    certificateValid: sub.signatureLegal === true,
    signingTime: new Date(0).toISOString(),
    documentHash: (sub.signatureDocumentHash ?? sub.xmlHash ?? sub.contentHash) as `sha256:${string}`,
    signatureHash: sub.signatureHash as `sha256:${string}`,
  };
}

export function applyHashBoundApproval(opts: {
  submissionId: string;
  approvalId: string;
  actor: string;
  persist?: boolean;
}): EtaxSubmissionRecord {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  const next = bindApprovalToSubmission(sub, {
    approvalId: opts.approvalId,
    contentHash: pkg.contentHash,
  });
  if (opts.persist !== false) {
    saveSubmission(next);
    appendEtaxAudit({
      actor: opts.actor,
      action: "ETAX_APPROVAL_GRANTED",
      objectId: next.id,
      contentHash: next.contentHash,
      specVersion: next.specVersion,
      result: "ok",
      detail: `approvalId=${opts.approvalId}`,
    });
  }
  return next;
}

export function markSubmissionReady(opts: {
  submissionId: string;
  env: EtaxEnvironment;
  actor: string;
  persist?: boolean;
}): EtaxSubmissionRecord {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  const next = markReadyToSubmit(sub, opts.env);
  if (opts.persist !== false) {
    saveSubmission(next);
    appendEtaxAudit({
      actor: opts.actor,
      action: "ETAX_SUBMISSION_REQUESTED",
      objectId: next.id,
      contentHash: next.contentHash,
      specVersion: next.specVersion,
      result: "ok",
      detail: `status=${next.status} env=${opts.env}`,
    });
  }
  return next;
}

export async function submitToEtax(opts: {
  submissionId: string;
  env: EtaxEnvironment;
  document: Buffer;
  actor: string;
  persist?: boolean;
}): Promise<{ submission: EtaxSubmissionRecord; result: SubmissionResult }> {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  if (sub.xmlHash && xmlHashOf(opts.document) !== sub.xmlHash) {
    throw etaxError({
      code: "ETAX_SUBMIT_XML_HASH_MISMATCH",
      field: "xmlHash",
      blocked: "HASH_MISMATCH",
      message: "Provided XML does not match the submission xmlHash",
    });
  }
  const sent = await sendSignedSubmission({
    sub,
    env: opts.env,
    document: opts.document,
    signature: signatureFromSubmission(sub),
  });
  if (opts.persist !== false) {
    saveSubmission(sent.submission);
    appendEtaxAudit({
      actor: opts.actor,
      action: sent.result.transportStatus === "sent" ? "ETAX_SUBMISSION_SENT" : "ETAX_TRANSPORT_ERROR",
      objectId: sent.submission.id,
      contentHash: sent.submission.contentHash,
      specVersion: sent.submission.specVersion,
      result: sent.result.transportStatus === "sent" ? "ok" : "failed",
      detail: `requestId=${sent.result.requestId ?? "none"} env=${opts.env}`,
    });
  }
  return sent;
}

export async function fetchEtaxReceipt(opts: {
  submissionId: string;
  env: EtaxEnvironment;
  actor: string;
  persist?: boolean;
}): Promise<{ submission: EtaxSubmissionRecord; receipt: ReceiptResult }> {
  const sub = requireSubmission(opts.submissionId);
  const pkg = requireReturnPackage(sub.packageId);
  assertBoundHash(pkg, sub);
  const pulled = await pullReceipt({ sub, env: opts.env });
  if (opts.persist !== false) {
    saveSubmission(pulled.submission);
    appendEtaxAudit({
      actor: opts.actor,
      action:
        pulled.receipt.status === "RECEIVED_BY_ETAX"
          ? "ETAX_RECEIPT_RECEIVED"
          : pulled.receipt.status === "REJECTED_BY_ETAX"
            ? "ETAX_SUBMISSION_REJECTED"
            : "ETAX_TRANSPORT_ERROR",
      objectId: pulled.submission.id,
      contentHash: pulled.submission.contentHash,
      specVersion: pulled.submission.specVersion,
      result: pulled.receipt.status === "RECEIVED_BY_ETAX" ? "ok" : "failed",
      detail: `receiptNumber=${pulled.receipt.receiptNumber ?? "none"}`,
    });
  }
  return pulled;
}

export function requestProductionSubmit(opts: {
  submissionId: string;
  env: EtaxEnvironment;
}): never {
  requireSubmission(opts.submissionId);
  assertProductionSubmitAllowed("production");
  throw etaxError({
    code: "ETAX_PRODUCTION_DISABLED",
    blocked: "PRODUCTION_DISABLED",
    message: "NTA transport is not certified. Production remains disabled.",
  });
}

/** Test-only / internal. Prefer validateAndAdvance and lifecycle writers. */
export function transitionSubmission(
  submissionId: string,
  to: EtaxSubmissionStatus,
): EtaxSubmissionRecord {
  const sub = requireSubmission(submissionId);
  const next = { ...sub, status: transitionStatus(sub.status, to) };
  saveSubmission(next);
  return next;
}
