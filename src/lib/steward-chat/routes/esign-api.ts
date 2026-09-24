/**
 * National eID (DigiDoc / SiVa) BFF.
 * Path: src/lib/steward-chat/routes/esign-api.ts
 *
 * The ledger keeps digests and the SiVa indication only. PDFs live in the
 * tenant work dir, and PINs / private keys never reach the server (ADR 0014).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit, type ChatAuditAction } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { buildPdfEsignReadyReport } from "../../pdf-esign/ready.js";
import { listPdfEsignCases, requirePdfEsignCase } from "../../pdf-esign/case-store.js";
import {
  attachUploadedEsignContainer,
  createEsignCaseFromUpload,
  prepareEsignSkeleton,
  verifyEsignContainer,
} from "../../pdf-esign/case-workflow.js";
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

function auditEsign(
  user: WireConsoleUser,
  pathname: string,
  action: ChatAuditAction,
  ok: boolean,
  detail: string,
): void {
  appendChatAudit({
    action,
    operator_id: user.operator_id,
    approver_id: user.approver_id,
    ok,
    path: pathname,
    detail,
  });
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
      const record = createEsignCaseFromUpload({
        title: body.title,
        filename: body.filename,
        pdf: decodeBase64(body.pdf_base64, "pdf"),
        contractId: body.contract_id,
        approvalId: body.approval_id,
      });
      auditEsign(user, pathname, "esign_create", true, record.id);
      json(res, 200, { ok: true, case: caseRow(record) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      auditEsign(user, pathname, "esign_create", false, message);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/esign/prepare" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = caseIdSchema.parse(await readJsonLimited(req));
      const record = requirePdfEsignCase(body.case_id);
      const prepared = await prepareEsignSkeleton(record, {
        skeletonPdfFilename: "document.pdf",
      });
      if (!prepared.ok) {
        auditEsign(user, pathname, "esign_prepare", false, `${record.id}: ${prepared.reason}`);
        json(res, 502, { ok: false, error: prepared.reason });
        return true;
      }
      auditEsign(user, pathname, "esign_prepare", true, prepared.case.id);
      json(res, 200, { ok: true, case: caseRow(prepared.case) });
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
      const record = requirePdfEsignCase(body.case_id);
      const attached = attachUploadedEsignContainer(
        record,
        decodeBase64(body.asice_base64, "asice"),
      );
      if (!attached.ok) {
        auditEsign(user, pathname, "esign_attach", false, `${record.id}: ${attached.reason}`);
        json(res, 422, { ok: false, error: attached.reason });
        return true;
      }
      auditEsign(user, pathname, "esign_attach", true, attached.case.id);
      json(res, 200, {
        ok: true,
        case: caseRow(attached.case),
        pdf_digest_matches: attached.pdf_digest_matches,
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
      const record = requirePdfEsignCase(body.case_id);
      if (!record.container_path) {
        throw new Error(`container missing for ${record.id} — attach first`);
      }
      const {
        result,
        nationallyVerified,
        case: next,
      } = await verifyEsignContainer(record, record.container_path, body.siva_mode);
      auditEsign(
        user,
        pathname,
        "esign_verify",
        result.ok,
        `${next.id}: ${result.indication} (${result.mode})`,
      );
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
