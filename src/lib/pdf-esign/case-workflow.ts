/**
 * National eID signing case steps shared by `orgos operations esign` and the Chat BFF.
 * Path: src/lib/pdf-esign/case-workflow.ts
 *
 * Callers load the case (and check surface-specific preconditions); these steps
 * move files, call the sidecar / SiVa and record L1 facts in the case ledger.
 * Only a live SiVa TOTAL-PASSED completes a case (ADR 0014).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { PdfEsignCase, SivaMode } from "../../../schemas/pdf-esign.js";
import { digestDocumentFile, digestFile } from "../document-digest.js";
import { digidocPdfEsignAdapter } from "./adapters/digidoc.js";
import { asiceContainsPdfDigest, inspectAsiceContainer, type AsiceLiteResult } from "./asice-lite.js";
import { insertPdfEsignCase, nextPdfEsignCaseId, updatePdfEsignCase } from "./case-store.js";
import { resolveDigidocRuntime } from "./digidoc-runtime.js";
import { createAsiceSkeletonViaSidecar } from "./digidoc-sidecar-client.js";
import { resolveActiveNationalEidStack } from "./national-eid.js";
import { getPdfEsignCaseWorkDir, resolvePdfEsignCaseWorkDir } from "./paths.js";
import { validateWithSiva, type SivaValidateResult } from "./siva-client.js";

const UNSIGNED_CONTAINER_FILENAME = "unsigned.asice";
const SIGNED_CONTAINER_FILENAME = "signed.asice";
const DEFAULT_UPLOAD_PDF_FILENAME = "source.pdf";
const CASE_FILE_MODE = 0o600;

export type EsignStepFailure = { ok: false; case: PdfEsignCase; reason?: string };

type CaseLinks = { contractId?: string; approvalId?: string };

function openCaseWorkspace(): { id: string; workDir: string } {
  const id = nextPdfEsignCaseId();
  const workDir = getPdfEsignCaseWorkDir(id);
  mkdirSync(workDir, { recursive: true });
  return { id, workDir };
}

function registerCase(
  input: CaseLinks & {
    id: string;
    workDir: string;
    title: string;
    providerId: string;
    pdfPath: string;
  },
): PdfEsignCase {
  const now = new Date().toISOString();
  const digest = digestDocumentFile(input.pdfPath);
  return insertPdfEsignCase({
    id: input.id,
    title: input.title,
    status: "draft",
    provider_id: input.providerId,
    national_eid_stack: resolveActiveNationalEidStack(),
    pdf_path: input.pdfPath,
    content_digest: digest.content_digest,
    byte_length: digest.byte_length,
    work_dir: input.workDir,
    contract_id: input.contractId,
    approval_id: input.approvalId,
    created_at: now,
    updated_at: now,
  });
}

function sanitizeUploadFilename(filename: string | undefined): string {
  return filename?.replace(/[^\w.-]/g, "_") ?? DEFAULT_UPLOAD_PDF_FILENAME;
}

function pdfDigestMatches(record: PdfEsignCase, lite: AsiceLiteResult): boolean | null {
  return record.content_digest ? asiceContainsPdfDigest(lite, record.content_digest) : null;
}

/** Case over an operator-provided PDF path; the PDF stays where it is. */
export function createEsignCaseFromFile(
  input: CaseLinks & { pdfPath: string; title: string; providerId?: string },
): PdfEsignCase {
  if (!existsSync(input.pdfPath)) {
    throw new Error(`pdf not found: ${input.pdfPath}`);
  }
  const { id, workDir } = openCaseWorkspace();
  return registerCase({
    ...input,
    id,
    workDir,
    providerId: input.providerId ?? "digidoc",
  });
}

/** Case over uploaded PDF bytes, stored 0600 in the case work dir. */
export function createEsignCaseFromUpload(
  input: CaseLinks & { title: string; filename?: string; pdf: Buffer },
): PdfEsignCase {
  const runtime = resolveDigidocRuntime();
  if (input.pdf.length > runtime.max_pdf_bytes) {
    throw new Error(`pdf_too_large: ${input.pdf.length} > ${runtime.max_pdf_bytes}`);
  }
  const { id, workDir } = openCaseWorkspace();
  const pdfPath = join(workDir, sanitizeUploadFilename(input.filename));
  writeFileSync(pdfPath, input.pdf, { mode: CASE_FILE_MODE });
  return registerCase({ ...input, id, workDir, providerId: "digidoc", pdfPath });
}

/** Unsigned ASiC-E skeleton via the digidoc4j sidecar. */
export async function prepareEsignSkeleton(
  record: PdfEsignCase,
  options: { skeletonPdfFilename?: string } = {},
): Promise<{ ok: true; case: PdfEsignCase } | EsignStepFailure> {
  const workDir = resolvePdfEsignCaseWorkDir(record);
  const result = await createAsiceSkeletonViaSidecar({
    pdfPath: record.pdf_path,
    filename: options.skeletonPdfFilename ?? basename(record.pdf_path),
    outPath: join(workDir, UNSIGNED_CONTAINER_FILENAME),
  });
  if (!result.ok) return { ok: false, case: record, reason: result.reason };
  const next = updatePdfEsignCase(record.id, {
    unsigned_asice_path: result.out_path,
    unsigned_asice_digest: result.digest,
    work_dir: workDir,
  });
  return { ok: true, case: next };
}

/** Hand the case to the human signer (DigiDoc4 + national card). */
export async function sendEsignCase(
  record: PdfEsignCase,
): Promise<{ ok: boolean; case: PdfEsignCase; message?: string }> {
  const result = await digidocPdfEsignAdapter.createEnvelope(record);
  const next = updatePdfEsignCase(record.id, {
    status: "sent",
    external_ref: result.external_ref,
  });
  return { ok: result.ok, case: next, message: result.message };
}

/** Record a signed container at an operator-provided path (structure checked at verify). */
export function attachEsignContainerFile(
  record: PdfEsignCase,
  containerPath: string,
): PdfEsignCase {
  if (!existsSync(containerPath)) {
    throw new Error(`asice not found: ${containerPath}`);
  }
  return updatePdfEsignCase(record.id, {
    container_path: containerPath,
    container_digest: digestFile(containerPath),
    status: "partially_signed",
  });
}

/** Store uploaded container bytes and record them only if the lite ASiC-E check passes. */
export function attachUploadedEsignContainer(
  record: PdfEsignCase,
  container: Buffer,
): { ok: true; case: PdfEsignCase; pdf_digest_matches: boolean | null } | EsignStepFailure {
  const runtime = resolveDigidocRuntime();
  if (container.length > runtime.max_asice_bytes) {
    throw new Error(`asice_too_large: ${container.length} > ${runtime.max_asice_bytes}`);
  }
  const workDir = resolvePdfEsignCaseWorkDir(record);
  mkdirSync(workDir, { recursive: true });
  const containerPath = join(workDir, SIGNED_CONTAINER_FILENAME);
  writeFileSync(containerPath, container, { mode: CASE_FILE_MODE });

  const lite = inspectAsiceContainer(containerPath, {
    maxAsiceBytes: runtime.max_asice_bytes,
  });
  if (!lite.ok) return { ok: false, case: record, reason: lite.reason };
  const next = updatePdfEsignCase(record.id, {
    container_path: containerPath,
    container_digest: lite.container_digest,
    status: "partially_signed",
  });
  return { ok: true, case: next, pdf_digest_matches: pdfDigestMatches(record, lite) };
}

function statusAfterVerification(
  result: SivaValidateResult,
  nationallyVerified: boolean,
): PdfEsignCase["status"] {
  if (nationallyVerified) return "completed";
  return result.ok ? "partially_signed" : "failed";
}

/** Validate the attached container and record the SiVa facts on the case. */
export async function verifyEsignContainer(
  record: PdfEsignCase,
  containerPath: string,
  sivaMode?: SivaMode,
): Promise<{ result: SivaValidateResult; nationallyVerified: boolean; case: PdfEsignCase }> {
  const runtime = resolveDigidocRuntime({ sivaMode });
  const lite = inspectAsiceContainer(containerPath, {
    maxAsiceBytes: runtime.max_asice_bytes,
  });
  const result = await validateWithSiva({
    asicePath: containerPath,
    liteOk: lite.ok,
    pdfDigestOk: pdfDigestMatches(record, lite),
    mode: sivaMode,
  });
  // Only a live SiVa TOTAL-PASSED completes a case; mock never does.
  const nationallyVerified = result.mode === "live" && result.ok;
  const next = updatePdfEsignCase(record.id, {
    siva_mode: result.mode,
    siva_indication: result.indication,
    siva_validated_at: new Date().toISOString(),
    siva_response_digest: result.response_digest,
    siva_signatures_count: result.signatures_count,
    siva_valid_signatures_count: result.valid_signatures_count,
    siva_reason: result.reason,
    status: statusAfterVerification(result, nationallyVerified),
  });
  return { result, nationallyVerified, case: next };
}
