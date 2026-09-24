/**
 * Correspondence BFF — list pending / send approved (SMTP).
 * Path: src/lib/steward-chat/routes/correspondence-api.ts
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { listCorrespondenceDrafts } from "../../correspondence/draft.js";
import { sendApprovedCorrespondence } from "../../correspondence/send-gate.js";
import { formatCorrespondenceDraftReview } from "../../correspondence/review.js";
import {
  disconnectTenantGmail,
  readTenantMailStatus,
  updateTenantMailBasics,
} from "../../correspondence/tenant-mail-console.js";
import {
  buildCommunityMailConnectUrl,
  getCommunityUrl,
  resolveCommunityGmailBindForCli,
} from "../../protocol/community-gmail-bind.js";
import {
  buildMailSecretsSnapshot,
  MAIL_ENV_KEYS,
  saveMailSecrets,
} from "../../correspondence/mail-secrets-store.js";
import { getTenantId } from "../../tenant.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const sendBodySchema = z.object({
  dry_run: z.boolean().optional(),
});

const gmailConnectSchema = z.object({
  expect_email: z.string().email().optional(),
});

const mailConfigSchema = z.object({
  from: z
    .object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  provider: z.enum(["smtp", "gmail_api", "dry_run"]).optional(),
  smtp: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().optional(),
      secure: z.boolean().optional(),
    })
    .optional(),
});

/** Write-only: values are stored server-side and never returned. */
const mailSecretsSchema = z
  .object(
    Object.fromEntries(
      MAIL_ENV_KEYS.map((key) => [key, z.string().min(1).optional()]),
    ) as Record<(typeof MAIL_ENV_KEYS)[number], z.ZodOptional<z.ZodString>>,
  )
  .strict();

function mailErrorStatus(err: unknown): number {
  if (err instanceof InvalidJsonError || err instanceof PayloadTooLargeError) return 400;
  if (err instanceof z.ZodError) return 422;
  return 400;
}

export async function handleCorrespondenceApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/mail/gmail" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const status = readTenantMailStatus();
    json(res, 200, {
      ok: true,
      ...status,
      secrets: buildMailSecretsSnapshot(),
      note: status.connected
        ? "Gmail API 接続済み。送信は承認済み下書きのみ。"
        : "未接続。会社の設定から連携するか、CLI: orgos mail setup gmail。",
    });
    return true;
  }

  if (pathname === "/chat/v1/mail/gmail/connect" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = gmailConnectSchema.parse((await readJsonLimited(req)) ?? {});
      const tenantId = getTenantId();
      const bind = await resolveCommunityGmailBindForCli(tenantId, {
        issuedForEmails: body.expect_email ? [body.expect_email] : undefined,
      });
      const connectUrl = buildCommunityMailConnectUrl(
        bind.tenant_id,
        bind.nonce,
        getCommunityUrl(),
      );
      appendChatAudit({
        action: "mail_gmail_connect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: bind.tenant_id,
      });
      const status = readTenantMailStatus();
      json(res, 200, {
        ok: true,
        tenant_id: bind.tenant_id,
        expires_at: bind.expires_at,
        connect_url: connectUrl,
        platform_ready: status.platform_ready,
        platform_detail: status.platform_detail,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "mail_gmail_connect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, mailErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/mail/gmail/disconnect" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const result = disconnectTenantGmail();
      appendChatAudit({
        action: "mail_gmail_disconnect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: result.provider,
      });
      json(res, 200, { ok: true, ...result, ...readTenantMailStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "mail_gmail_disconnect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, mailErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/mail/secrets" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = mailSecretsSchema.parse((await readJsonLimited(req)) ?? {});
      const saved = saveMailSecrets(body);
      appendChatAudit({
        action: "mail_secrets_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: Object.keys(saved).join(","),
      });
      json(res, 200, { ok: true, secrets: buildMailSecretsSnapshot() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "mail_secrets_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, mailErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/mail/config" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = mailConfigSchema.parse((await readJsonLimited(req)) ?? {});
      updateTenantMailBasics(body);
      appendChatAudit({
        action: "mail_config_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: body.provider ?? "from",
      });
      json(res, 200, { ok: true, ...readTenantMailStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "mail_config_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, mailErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/correspondence/pending" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const pending = listCorrespondenceDrafts({ status: "pending_approval" });
    const approved = listCorrespondenceDrafts({ status: "approved" });
    const rows = [...pending, ...approved].slice(0, 40).map((d) => ({
      draft_id: d.draft_id,
      status: d.status,
      channel: d.channel,
      subject: d.subject ?? d.slack_channel ?? d.draft_id,
      approval_id: d.approval_id,
      created_at: d.created_at,
      preview: formatCorrespondenceDraftReview(d).slice(0, 2000),
      href: d.approval_id
        ? `/approvals/?id=${encodeURIComponent(d.approval_id)}`
        : "/approvals/",
    }));
    json(res, 200, { ok: true, drafts: rows });
    return true;
  }

  const sendMatch = pathname.match(/^\/chat\/v1\/correspondence\/([^/]+)\/send$/);
  if (sendMatch && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    const draftId = decodeURIComponent(sendMatch[1]!);
    try {
      const raw = await readJsonLimited(req);
      const body = sendBodySchema.parse(raw ?? {});
      const result = await sendApprovedCorrespondence({
        draftId,
        operatorId: user.operator_id,
        dryRun: body.dry_run === true,
      });
      appendChatAudit({
        action: "correspondence_send",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: draftId,
      });
      json(res, 200, {
        ok: true,
        draft_id: result.draft.draft_id,
        status: result.draft.status,
        send: result.sendResult,
        company_event_id: result.companyEventId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "correspondence_send",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      const status =
        err instanceof InvalidJsonError || err instanceof PayloadTooLargeError
          ? 400
          : err instanceof z.ZodError
            ? 422
            : 400;
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
