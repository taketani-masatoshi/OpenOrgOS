/**
 * National eID (DigiDoc / SiVa) BFF.
 * Path: src/lib/steward-chat/routes/esign-api.ts
 *
 * The ledger keeps digests and the SiVa indication only. PDFs live in the
 * tenant work dir, and PINs / private keys never reach the server (ADR 0014).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { digestDocumentFile } from "../../document-digest.js";
import { buildPdfEsignReadyReport } from "../../pdf-esign/ready.js";
import {
  findPdfEsignCase,
  insertPdfEsignCase,
  listPdfEsignCases,
  nextPdfEsignCaseId,
  updatePdfEsignCase,
} from "../../pdf-esign/case-store.js";
import { getPdfEsignDataDir } from "../../pdf-esign/paths.js";
import { resolveActiveNationalEidStack } from "../../pdf-esign/national-eid.js";
import { resolveDigidocRuntime } from "../../pdf-esign/digidoc-runtime.js";
import { createAsiceSkeletonViaSidecar } from "../../pdf-esign/digidoc-sidecar-client.js";
import {
  asiceContainsPdfDigest,
  inspectAsiceContainer,
} from "../../pdf-esign/asice-lite.js";
import { validateWithSiva } from "../../pdf-esign/siva-client.js";
import type { PdfEsignCase } from "../../../../schemas/pdf-esign.js";

/** Base64 containers are bulky; cap the body well above a realistic contract. */
const MAX_UPLOAD_BODY_BYTES = 48 * 1024 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorStatus(err: unknown): number {
  if (err instanceof PayloadTooLargeError) return 413;
  if (err instanceof InvalidJsonError) return 400;
  if (err instanceof z.ZodError) return 422;
  return 422;
}

const createSchema = z.object({
  title: z.string().min(1),
  filename: z.string().min(1).optional(),
  pdf_base64: z.string().min(1),
  contract_id: z.string().min(1).optional(),
  approval_id: z.string().min(1).optional(),
});

const caseIdSchema = z.object({ case_id: z.string().min(1) });

const attachSchema = caseIdSchema.extend({
  asice_base64: z.string().min(1),
  filename: z.string().min(1).optional(),
});

const verifySchema = caseIdSchema.extend({
  siva_mode: z.enum(["live", "mock"]).optional(),
});

/** Ledger-safe view — paths and digests, never document bytes. */
function caseRow(c: PdfEsignCase) {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    provider_id: c.provider_id,
    content_digest: c.content_digest,
    container_digest: c.container_digest,
    unsigned_asice_digest: c.unsigned_asice_digest,
    siva_mode: c.siva_mode,
    siva_indication: c.siva_indication,
    siva_validated_at: c.siva_validated_at,
    siva_signatures_count: c.siva_signatures_count,
    siva_valid_signatures_count: c.siva_valid_signatures_count,
    siva_reason: c.siva_reason,
    contract_id: c.contract_id,
    approval_id: c.approval_id,
    updated_at: c.updated_at,
  };
}

function decodeBase64(value: string, kind: string): Buffer {
  const buf = Buffer.from(value, "base64");
  if (buf.length === 0) throw new Error(`${kind}_empty_or_not_base64`);
  return buf;
}

function requireCase(caseId: string): PdfEsignCase {
  const record = findPdfEsignCase(caseId);
  if (!record) throw new Error(`esign case not found: ${caseId}`);
  return record;
}

export async function handleEsignApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/esign/ready" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, report: await buildPdfEsignReadyReport() });
    return true;
  }

  if (pathname === "/chat/v1/esign/cases" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, cases: listPdfEsignCases().map(caseRow) });
    return true;
  }

  if (pathname === "/chat/v1/esign/create" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = createSchema.parse(await readJsonLimited(req, MAX_UPLOAD_BODY_BYTES));
      const runtime = resolveDigidocRuntime();
      const pdf = decodeBase64(body.pdf_base64, "pdf");
      if (pdf.length > runtime.max_pdf_bytes) {
        throw new Error(`pdf_too_large: ${pdf.length} > ${runtime.max_pdf_bytes}`);
      }

      const id = nextPdfEsignCaseId();
      const workDir = join(getPdfEsignDataDir(), "work", id);
      mkdirSync(workDir, { recursive: true });
      const pdfPath = join(workDir, body.filename?.replace(/[^\w.-]/g, "_") ?? "source.pdf");
      writeFileSync(pdfPath, pdf, { mode: 0o600 });

      const now = new Date().toISOString();
      const digest = digestDocumentFile(pdfPath);
      const record = insertPdfEsignCase({
        id,
        title: body.title,
        status: "draft",
        provider_id: "digidoc",
        national_eid_stack: resolveActiveNationalEidStack(),
        pdf_path: pdfPath,
        content_digest: digest.content_digest,
        byte_length: digest.byte_length,
        work_dir: workDir,
        contract_id: body.contract_id,
        approval_id: body.approval_id,
        created_at: now,
        updated_at: now,
      });
      appendChatAudit({
        action: "esign_create",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: record.id,
      });
      json(res, 200, { ok: true, case: caseRow(record) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "esign_create",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/esign/prepare" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = caseIdSchema.parse(await readJsonLimited(req));
      const record = requireCase(body.case_id);
      const workDir = record.work_dir ?? join(getPdfEsignDataDir(), "work", record.id);
      mkdirSync(workDir, { recursive: true });
      const outPath = join(workDir, "unsigned.asice");
      const result = await createAsiceSkeletonViaSidecar({
        pdfPath: record.pdf_path,
        filename: "document.pdf",
        outPath,
      });
      if (!result.ok) {
        appendChatAudit({
          action: "esign_prepare",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: false,
          path: pathname,
          detail: `${record.id}: ${result.reason}`,
        });
        json(res, 502, { ok: false, error: result.reason });
        return true;
      }
      const next = updatePdfEsignCase(record.id, {
        unsigned_asice_path: result.out_path,
        unsigned_asice_digest: result.digest,
        work_dir: workDir,
      });
      appendChatAudit({
        action: "esign_prepare",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: next.id,
      });
      json(res, 200, { ok: true, case: caseRow(next) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/esign/attach" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = attachSchema.parse(await readJsonLimited(req, MAX_UPLOAD_BODY_BYTES));
      const record = requireCase(body.case_id);
      const runtime = resolveDigidocRuntime();
      const container = decodeBase64(body.asice_base64, "asice");
      if (container.length > runtime.max_asice_bytes) {
        throw new Error(`asice_too_large: ${container.length} > ${runtime.max_asice_bytes}`);
      }
      const workDir = record.work_dir ?? join(getPdfEsignDataDir(), "work", record.id);
      mkdirSync(workDir, { recursive: true });
      const containerPath = join(workDir, "signed.asice");
      writeFileSync(containerPath, container, { mode: 0o600 });

      const lite = inspectAsiceContainer(containerPath, {
        maxAsiceBytes: runtime.max_asice_bytes,
      });
      if (!lite.ok) {
        appendChatAudit({
          action: "esign_attach",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: false,
          path: pathname,
          detail: `${record.id}: ${lite.reason}`,
        });
        json(res, 422, { ok: false, error: lite.reason });
        return true;
      }
      const next = updatePdfEsignCase(record.id, {
        container_path: containerPath,
        container_digest: lite.container_digest,
        status: "partially_signed",
      });
      appendChatAudit({
        action: "esign_attach",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: next.id,
      });
      json(res, 200, {
        ok: true,
        case: caseRow(next),
        pdf_digest_matches: record.content_digest
          ? asiceContainsPdfDigest(lite, record.content_digest)
          : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/esign/verify" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = verifySchema.parse(await readJsonLimited(req));
      const record = requireCase(body.case_id);
      if (!record.container_path) {
        throw new Error(`container missing for ${record.id} — attach first`);
      }
      const runtime = resolveDigidocRuntime({ sivaMode: body.siva_mode });
      const lite = inspectAsiceContainer(record.container_path, {
        maxAsiceBytes: runtime.max_asice_bytes,
      });
      const pdfDigestOk = record.content_digest
        ? asiceContainsPdfDigest(lite, record.content_digest)
        : null;
      const result = await validateWithSiva({
        asicePath: record.container_path,
        liteOk: lite.ok,
        pdfDigestOk,
        mode: body.siva_mode,
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
        status: nationallyVerified
          ? "completed"
          : result.ok
            ? "partially_signed"
            : "failed",
      });
      appendChatAudit({
        action: "esign_verify",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.ok,
        path: pathname,
        detail: `${next.id}: ${result.indication} (${result.mode})`,
      });
      json(res, 200, {
        ok: result.ok,
        nationally_verified: nationallyVerified,
        case: caseRow(next),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  return false;
}
