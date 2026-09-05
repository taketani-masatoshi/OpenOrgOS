/**
 * Connector hub BFF — connect / disconnect / route external replicas.
 * Path: src/lib/steward-chat/routes/integrations-api.ts
 *
 * Reading the hub is `chat:read`. Everything that changes what leaves the
 * company — connecting an account, choosing a destination, posting, pushing or
 * uploading — is `chat:approve`, the same weight as sending mail.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  connectorProviderSchema,
  type ConnectorProvider,
} from "../../../../schemas/connectors.js";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { getTenantId } from "../../tenant.js";
import {
  buildConnectorCard,
  buildConnectorHubSnapshot,
  connectorPlatformReadiness,
} from "../../integrations/connector-hub.js";
import {
  deleteConnectorToken,
  saveConnectorSettings,
} from "../../integrations/connector-store.js";
import {
  buildConnectorSecretsSnapshot,
  CONNECTOR_ENV_KEYS,
  saveConnectorSecrets,
} from "../../integrations/connector-secrets-store.js";
import {
  buildConnectorConnectUrl,
  createConnectorBind,
} from "../../protocol/community-connector-bind.js";
import {
  buildCommunityMailConnectUrl,
  getCommunityUrl,
  resolveCommunityGmailBindForCli,
} from "../../protocol/community-gmail-bind.js";
import { sendConsoleSlackMessage } from "../../integrations/slack-connector.js";
import { pushAsanaTarget } from "../../integrations/asana-adapter.js";
import { exportToGoogleDrive, listDriveExports } from "../../integrations/gdrive-export.js";
import {
  exportHttpOutbound,
  httpOutboundSettingsPatchSchema,
  httpOutboundStatus,
  loadHttpOutboundConfig,
  saveHttpOutboundConfig,
} from "../../integrations/http-outbound-adapter.js";
import {
  buildHttpOutboundSecretsSnapshot,
  HTTP_OUTBOUND_ENV_KEYS,
  saveHttpOutboundSecrets,
} from "../../integrations/http-outbound-secrets.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const connectSchema = z.object({
  expect_email: z.string().email().optional(),
});

const settingsSchema = z
  .object({
    default_channel_id: z.string().min(1).optional(),
    default_channel_name: z.string().min(1).optional(),
    default_project_gid: z.string().min(1).optional(),
    default_folder_id: z.string().min(1).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

/** Write-only: stored server-side, never echoed back. */
const secretsSchema = z
  .object(
    Object.fromEntries(
      CONNECTOR_ENV_KEYS.map((key) => [key, z.string().min(1).optional()]),
    ) as Record<(typeof CONNECTOR_ENV_KEYS)[number], z.ZodOptional<z.ZodString>>,
  )
  .strict();

const slackSendSchema = z
  .object({
    text: z.string().min(1).max(4000),
    channel: z.string().min(1).optional(),
    dry_run: z.boolean().optional(),
  })
  .strict();

const asanaPushSchema = z
  .object({
    kind: z.enum(["work_order", "executive_task", "case"]),
    id: z.string().min(1),
    project_gid: z.string().min(1).optional(),
  })
  .strict();

const driveExportSchema = z
  .object({
    kind: z.enum(["receipt", "document", "work_order", "executive_tasks"]),
    id: z.string().min(1).optional(),
    folder_id: z.string().min(1).optional(),
  })
  .strict();

const httpSecretsSchema = z
  .object(
    Object.fromEntries(
      HTTP_OUTBOUND_ENV_KEYS.map((key) => [key, z.string().min(1).optional()]),
    ) as Record<(typeof HTTP_OUTBOUND_ENV_KEYS)[number], z.ZodOptional<z.ZodString>>,
  )
  .strict();

const httpExportSchema = z
  .object({
    kind: z.enum(["monthly", "invoice"]),
    id: z.string().min(1),
    dry_run: z.boolean().optional(),
  })
  .strict();

function errorStatus(err: unknown): number {
  if (err instanceof InvalidJsonError || err instanceof PayloadTooLargeError) return 400;
  if (err instanceof z.ZodError) return 422;
  return 400;
}

function parseProvider(value: string): ConnectorProvider | null {
  const parsed = connectorProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Gmail keeps the tenant-mail bind so the callback also writes mail-config;
 * the other providers use the generic connector bind.
 */
async function buildConnectUrl(
  provider: ConnectorProvider,
  tenantId: string,
  expectEmail?: string,
): Promise<{ connect_url: string; expires_at: string; tenant_id: string }> {
  if (provider === "gmail") {
    const bind = await resolveCommunityGmailBindForCli(tenantId, {
      issuedForEmails: expectEmail ? [expectEmail] : undefined,
    });
    return {
      connect_url: buildCommunityMailConnectUrl(bind.tenant_id, bind.nonce, getCommunityUrl()),
      expires_at: bind.expires_at,
      tenant_id: bind.tenant_id,
    };
  }
  const bind = createConnectorBind(provider, tenantId, {
    issuedForEmails: expectEmail ? [expectEmail] : undefined,
  });
  return {
    connect_url: buildConnectorConnectUrl(provider, bind.tenant_id, bind.nonce),
    expires_at: bind.expires_at,
    tenant_id: bind.tenant_id,
  };
}

export async function handleIntegrationsApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/integrations")) return false;

  // @ooo-route GET /chat/v1/integrations
  if (pathname === "/chat/v1/integrations" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, {
      ok: true,
      ...buildConnectorHubSnapshot(),
      http_outbound: httpOutboundStatus(),
    });
    return true;
  }

  // @ooo-route GET /chat/v1/integrations/http
  if (pathname === "/chat/v1/integrations/http" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, {
      ok: true,
      status: httpOutboundStatus(),
      config: loadHttpOutboundConfig(),
    });
    return true;
  }

  // @ooo-route PUT /chat/v1/integrations/http/settings
  if (pathname === "/chat/v1/integrations/http/settings" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = httpOutboundSettingsPatchSchema.parse((await readJsonLimited(req)) ?? {});
      const saved = saveHttpOutboundConfig(body, user.operator_id);
      appendChatAudit({
        action: "http_outbound_settings_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: saved.dialect,
      });
      json(res, 200, { ok: true, config: saved, status: httpOutboundStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "http_outbound_settings_update",
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

  // @ooo-route PUT /chat/v1/integrations/http/secrets
  if (pathname === "/chat/v1/integrations/http/secrets" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = httpSecretsSchema.parse((await readJsonLimited(req)) ?? {});
      saveHttpOutboundSecrets(body);
      appendChatAudit({
        action: "http_outbound_secrets_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: Object.keys(body).join(","),
      });
      json(res, 200, { ok: true, secrets: buildHttpOutboundSecretsSnapshot() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "http_outbound_secrets_update",
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

  // @ooo-route POST /chat/v1/integrations/http/export
  if (pathname === "/chat/v1/integrations/http/export" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = httpExportSchema.parse((await readJsonLimited(req)) ?? {});
      const result = await exportHttpOutbound({
        kind: body.kind,
        id: body.id,
        dryRun: body.dry_run === true,
        operatorId: user.operator_id,
      });
      appendChatAudit({
        action: "http_outbound_export",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.ok,
        path: pathname,
        detail: `${body.kind}:${body.id}`,
      });
      json(res, result.ok ? 200 : 422, { ...result, ok: result.ok });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "http_outbound_export",
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

  // @ooo-route PUT /chat/v1/integrations/secrets
  if (pathname === "/chat/v1/integrations/secrets" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = secretsSchema.parse((await readJsonLimited(req)) ?? {});
      const saved = saveConnectorSecrets(body);
      appendChatAudit({
        action: "connector_secrets_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: Object.keys(saved).join(","),
      });
      json(res, 200, { ok: true, secrets: buildConnectorSecretsSnapshot() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "connector_secrets_update",
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

  // @ooo-route GET /chat/v1/integrations/gdrive/exports
  if (pathname === "/chat/v1/integrations/gdrive/exports" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, exports: listDriveExports() });
    return true;
  }

  const providerMatch = pathname.match(/^\/chat\/v1\/integrations\/([^/]+)\/([^/]+)$/);
  if (!providerMatch) return false;

  const provider = parseProvider(decodeURIComponent(providerMatch[1]!));
  const action = providerMatch[2]!;
  if (!provider) {
    json(res, 404, { ok: false, error: "unknown connector provider" });
    return true;
  }

  // @ooo-route POST /chat/v1/integrations/:provider/connect
  if (action === "connect" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = connectSchema.parse((await readJsonLimited(req)) ?? {});
      const platform = connectorPlatformReadiness(provider);
      if (!platform.ready) {
        json(res, 403, {
          ok: false,
          error: platform.detail,
          platform_ready: false,
          platform_detail: platform.detail,
        });
        return true;
      }
      const bind = await buildConnectUrl(provider, getTenantId(), body.expect_email);
      appendChatAudit({
        action: "connector_connect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: provider,
      });
      json(res, 200, { ok: true, provider, ...bind, platform_ready: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "connector_connect",
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

  // @ooo-route POST /chat/v1/integrations/:provider/disconnect
  if (action === "disconnect" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const removed = deleteConnectorToken(provider);
      appendChatAudit({
        action: "connector_disconnect",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: provider,
      });
      json(res, 200, { ok: true, removed, connector: buildConnectorCard(provider) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  // @ooo-route PUT /chat/v1/integrations/:provider/settings
  if (action === "settings" && method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = settingsSchema.parse((await readJsonLimited(req)) ?? {});
      saveConnectorSettings(provider, body, user.operator_id);
      appendChatAudit({
        action: "connector_settings_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: provider,
      });
      json(res, 200, { ok: true, connector: buildConnectorCard(provider) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  // @ooo-route POST /chat/v1/integrations/slack/send
  if (provider === "slack" && action === "send" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = slackSendSchema.parse((await readJsonLimited(req)) ?? {});
      const result = await sendConsoleSlackMessage({
        text: body.text,
        channel: body.channel,
        dryRun: body.dry_run === true,
        operatorId: user.operator_id,
      });
      appendChatAudit({
        action: "connector_slack_send",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.sent || result.dryRun === true,
        path: pathname,
        detail: result.reason,
      });
      json(res, result.sent || result.dryRun ? 200 : 422, { ok: result.sent || Boolean(result.dryRun), ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "connector_slack_send",
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

  // @ooo-route POST /chat/v1/integrations/asana/push
  if (provider === "asana" && action === "push" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = asanaPushSchema.parse((await readJsonLimited(req)) ?? {});
      const result = await pushAsanaTarget({
        kind: body.kind,
        id: body.id,
        projectGid: body.project_gid,
      });
      appendChatAudit({
        action: "connector_asana_push",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.ok,
        path: pathname,
        detail: `${body.kind}:${body.id}`,
      });
      json(res, result.ok ? 200 : 422, { ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "connector_asana_push",
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

  // @ooo-route POST /chat/v1/integrations/gdrive/export
  if (provider === "gdrive" && action === "export" && method === "POST") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    try {
      const body = driveExportSchema.parse((await readJsonLimited(req)) ?? {});
      const result = await exportToGoogleDrive({
        kind: body.kind,
        id: body.id,
        folderId: body.folder_id,
        operatorId: user.operator_id,
      });
      appendChatAudit({
        action: "connector_gdrive_export",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.ok,
        path: pathname,
        detail: `${body.kind}:${body.id ?? "-"}`,
      });
      json(res, result.ok ? 200 : 422, { ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "connector_gdrive_export",
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

  return false;
}
