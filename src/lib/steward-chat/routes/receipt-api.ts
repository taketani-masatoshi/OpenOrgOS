import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireBudgetSurfacePermission } from "../../console-auth/surface-guard.js";
import { resolveOperatorFromSessionUser } from "../../console-auth/operator-rbac.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { appendChatAudit } from "../audit.js";
import {
  approveReceiptClaim,
  defaultReceiptQrConfig,
  encodeReceiptLink,
  findStoredReceipt,
  initReceiptQrConfig,
  issueReceipt,
  loadReceiptConfigOrDefault,
  loadReceiptRegistry,
  loadSignedReceiptForPdf,
  receiptPortalUrl,
  rejectReceiptClaim,
  resolveReceiptIssuerIdentity,
  claimReceiptRemotely,
  type ReceiptIssueInput,
} from "../../receipt-qr.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../../utils.js";
import { generateReceiptPdfBuffer } from "../../receipt-pdf.js";
import { renderReceiptQrSvg } from "../../receipt-qr-render.js";
import {
  receiptClaimStatusSchema,
  receiptDocumentTypeSchema,
  receiptLineSchema,
  signedReceiptQrPayloadSchema,
} from "../../../../schemas/receipt-qr.js";
import { z } from "zod";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function formatRouteError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function auditMutation(
  user: WireConsoleUser,
  pathname: string,
  detail: string,
  ok: boolean,
): void {
  appendChatAudit({
    action: "message",
    operator_id: user.operator_id,
    approver_id: user.approver_id,
    ok,
    path: pathname,
    detail,
  });
}

const issueBodySchema = z.object({
  document_type: receiptDocumentTypeSchema,
  transaction_date: z.string().date(),
  /** Ignored — resolved from tenant corporate_number / company.yaml. */
  issuer_name: z.string().min(1).optional(),
  /** Ignored — resolved from tenant corporate_number / tax-profile. */
  invoice_registration_number: z.string().regex(/^T\d{13}$/).optional(),
  recipient_name: z.string().min(1).optional(),
  lines: z.array(receiptLineSchema).min(1),
  claim_endpoint: z.string().url().optional(),
});

function resolveClaimEndpoint(explicit?: string): string {
  const config = loadReceiptConfigOrDefault();
  if (explicit) {
    if (!explicit.startsWith(config.claim_base_url.replace(/\/$/, ""))) {
      throw new Error("claim_endpoint must be under the configured claim_base_url");
    }
    return explicit;
  }
  return config.claim_base_url.replace(/\/$/, "");
}

function mapStoredReceipt(row: ReturnType<typeof loadReceiptRegistry>["receipts"][number]) {
  return {
    receipt_id: row.receipt.receipt_id,
    document_type: row.receipt.document_type,
    transaction_date: row.receipt.transaction_date,
    issued_at: row.receipt.issued_at,
    issuer_name: row.receipt.issuer.name,
    invoice_registration_number: row.receipt.issuer.invoice_registration_number,
    recipient_name: row.receipt.recipient_name,
    total_amount: row.receipt.total_amount,
    digest: row.digest,
    claim_status: row.claim_status,
    claimed_by_org_id: row.claimed_by_org_id,
    claimed_by_peer_id: row.claimed_by_peer_id,
    claim_approval_id: row.claim_approval_id,
    claim_requested_at: row.claim_requested_at,
    claimed_at: row.claimed_at,
    claim_rejected_at: row.claim_rejected_at,
    claim_reject_reason: row.claim_reject_reason,
    claim_rejected_by: row.claim_rejected_by,
    lines: row.receipt.lines,
    tax_totals: row.receipt.tax_totals,
  };
}

/**
 * Issuer / claimant receipt claim HTTP surface for Steward Chat.
 * Wire payloads remain amount-free (ADR 0032).
 */
export async function handleReceiptApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/receipts")) return false;

  if (pathname === "/chat/v1/receipts/issuer" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const issuer = resolveReceiptIssuerIdentity();
      json(res, 200, { ok: true, ...issuer });
    } catch (error) {
      json(res, 422, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const statusFilter = url.searchParams.get("status");
      let rows = loadReceiptRegistry().receipts;
      if (statusFilter) {
        const status = receiptClaimStatusSchema.parse(statusFilter);
        rows = rows.filter((row) => row.claim_status === status);
      }
      json(res, 200, {
        ok: true,
        receipts: rows.map(mapStoredReceipt),
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/pending-claims" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const pending = loadReceiptRegistry()
        .receipts.filter((row) => row.claim_status === "claim_pending_approval")
        .map((row) => ({
          ...mapStoredReceipt(row),
          // Issuer-local context only — never placed on Wire envelopes.
          total_amount: row.receipt.total_amount,
        }));
      json(res, 200, { ok: true, pending });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/preview" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const body = issueBodySchema.parse(await readJsonLimited(req, 64 * 1024));
      const input: ReceiptIssueInput = {
        ...body,
        claim_endpoint: resolveClaimEndpoint(body.claim_endpoint),
      };
      const result = issueReceipt(input, { persist: false });
      const portal = receiptPortalUrl();
      const link = encodeReceiptLink(result.qrPayload, portal);
      const qr_svg = await renderReceiptQrSvg(link);
      json(res, 200, {
        ok: true,
        receipt_id: result.stored.receipt.receipt_id,
        digest: result.stored.digest,
        total_amount: result.stored.receipt.total_amount,
        tax_totals: result.stored.receipt.tax_totals,
        lines: result.stored.receipt.lines,
        qr_link: link,
        qr_svg,
        persisted: false,
      });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload_too_large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid_json" });
        return true;
      }
      json(res, 422, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/issue" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "receipt:issue", res)) return true;
    try {
      // First-run: ensure config exists so issue does not fail after preview worked.
      const configPath = join(getDataDir(), "receipt-qr", "config.yaml");
      if (!existsSync(configPath)) {
        const defaults = defaultReceiptQrConfig();
        initReceiptQrConfig({
          claim_base_url: defaults.claim_base_url,
          receipt_portal_url: defaults.receipt_portal_url,
          simple_invoice_eligible: defaults.simple_invoice_eligible,
          simple_invoice_basis: defaults.simple_invoice_basis,
          tax_rounding: defaults.tax_rounding,
        });
      }
      const body = issueBodySchema.parse(await readJsonLimited(req, 64 * 1024));
      const input: ReceiptIssueInput = {
        ...body,
        claim_endpoint: resolveClaimEndpoint(body.claim_endpoint),
      };
      const result = issueReceipt(input);
      const portal = receiptPortalUrl();
      const link = encodeReceiptLink(result.qrPayload, portal);
      const qr_svg = await renderReceiptQrSvg(link);
      auditMutation(
        user,
        pathname,
        `receipt issue ${result.stored.receipt.receipt_id}`,
        true,
      );
      json(res, 200, {
        ok: true,
        receipt_id: result.stored.receipt.receipt_id,
        digest: result.stored.digest,
        total_amount: result.stored.receipt.total_amount,
        tax_totals: result.stored.receipt.tax_totals,
        lines: result.stored.receipt.lines,
        qr_link: link,
        qr_svg,
        claim_status: result.stored.claim_status,
        persisted: true,
      });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload_too_large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid_json" });
        return true;
      }
      const message = formatRouteError(error);
      auditMutation(user, pathname, message, false);
      json(res, 422, { ok: false, error: message });
    }
    return true;
  }

  const pdfMatch = pathname.match(/^\/chat\/v1\/receipts\/([^/]+)\/pdf$/);
  if (pdfMatch && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const receiptId = decodeURIComponent(pdfMatch[1]!);
      const payload = loadSignedReceiptForPdf(receiptId);
      const buffer = await generateReceiptPdfBuffer(payload);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptId}.pdf"`,
        "Content-Length": buffer.byteLength,
      });
      res.end(buffer);
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  const detailMatch = pathname.match(/^\/chat\/v1\/receipts\/([^/]+)$/);
  if (detailMatch && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    try {
      const receiptId = decodeURIComponent(detailMatch[1]!);
      const row = findStoredReceipt(receiptId);
      if (!row) {
        json(res, 404, { ok: false, error: "not_found" });
        return true;
      }
      json(res, 200, { ok: true, receipt: mapStoredReceipt(row) });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/approve-claim" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:approve", res)) return true;
    try {
      const body = (await readJsonLimited(req, 64 * 1024)) as Record<
        string,
        unknown
      >;
      const actor = resolveOperatorFromSessionUser(user);
      const receiptId = String(body.receipt_id ?? "");
      const approverId =
        actor?.display_name ||
        actor?.operator_id ||
        user.operator_id ||
        "";
      const row = approveReceiptClaim({
        receiptId,
        approverId,
        operatorId: actor?.operator_id,
      });
      auditMutation(
        user,
        pathname,
        `receipt approve-claim ${receiptId}`,
        true,
      );
      json(res, 200, {
        ok: true,
        receipt_id: row.receipt.receipt_id,
        claim_status: row.claim_status,
        claimed_event_id: row.claimed_event_id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      auditMutation(user, pathname, message, false);
      json(res, 422, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/reject-claim" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:approve", res)) return true;
    try {
      const body = (await readJsonLimited(req, 64 * 1024)) as Record<
        string,
        unknown
      >;
      const actor = resolveOperatorFromSessionUser(user);
      const receiptId = String(body.receipt_id ?? "");
      const reason = String(body.reason ?? "").trim();
      const approverId =
        actor?.display_name ||
        actor?.operator_id ||
        user.operator_id ||
        "";
      const row = rejectReceiptClaim({
        receiptId,
        approverId,
        reason,
      });
      auditMutation(
        user,
        pathname,
        `receipt reject-claim ${receiptId}`,
        true,
      );
      json(res, 200, {
        ok: true,
        receipt_id: row.receipt.receipt_id,
        claim_status: row.claim_status,
        claim_reject_reason: row.claim_reject_reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      auditMutation(user, pathname, message, false);
      json(res, 422, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/receipts/claim" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req, 256 * 1024)) as unknown;
      const payload = signedReceiptQrPayloadSchema.parse(body);
      const remote = await claimReceiptRemotely(payload);
      auditMutation(
        user,
        pathname,
        `receipt claim-remote ${payload.receipt.receipt_id} ${remote.status}`,
        remote.status >= 200 && remote.status < 300,
      );
      json(res, remote.status, {
        ok: remote.status >= 200 && remote.status < 300,
        ...remote.body,
        event_id: remote.event_id,
      });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload_too_large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid_json" });
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      auditMutation(user, pathname, message, false);
      json(res, 422, { ok: false, error: message });
    }
    return true;
  }

  json(res, 404, { ok: false, error: "not_found" });
  return true;
}
