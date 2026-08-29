/**
 * Platform (operations) BFF — Community shipping flags and Witness Hub status.
 * Path: src/lib/steward-chat/routes/platform-api.ts
 *
 * Operations-only: a tenant operator must never flip a platform flag.
 * ADR 0004 keeps shipping an explicit decision, so `community export`
 * still preserves rather than derives these values.
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
import {
  COMMUNITY_INTEGRATION_FLAGS,
  probeCommunityMailEnv,
  readCommunityIntegrationFlags,
  setCommunityIntegrationFlag,
} from "../../protocol/community-integration-flags.js";
import { getCommunityUrl } from "../../protocol/community-gmail-bind.js";
import { buildHubStatusReport } from "../../hub/status.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const flagSchema = z.object({
  flag: z.enum(COMMUNITY_INTEGRATION_FLAGS),
  value: z.boolean(),
});

/**
 * Operators allowed to run the platform view.
 * `ORGOS_PLATFORM_OPERATORS` is an explicit allowlist of operator ids —
 * a tenant CEO is not a platform operator by default.
 */
export function isPlatformOperator(user: WireConsoleUser): boolean {
  const allow = (process.env.ORGOS_PLATFORM_OPERATORS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(user.operator_id);
}

function requirePlatformOperator(user: WireConsoleUser, res: ServerResponse): boolean {
  if (isPlatformOperator(user)) return true;
  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: false,
      error: "forbidden",
      detail: "platform operations only (ORGOS_PLATFORM_OPERATORS)",
    }),
  );
  return false;
}

export async function handlePlatformApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/hub/status" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    if (!requirePlatformOperator(user, res)) return true;
    json(res, 200, { ok: true, ...(await buildHubStatusReport()) });
    return true;
  }

  if (pathname !== "/chat/v1/platform/integration") return false;

  if (method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    if (!requirePlatformOperator(user, res)) return true;
    const community = await probeCommunityMailEnv(getCommunityUrl());
    json(res, 200, {
      ok: true,
      flags: readCommunityIntegrationFlags(),
      community_env: community,
      note:
        "フラグは Steward 側の宣言。Community 側の env は再デプロイが必要で、上の community_env が実状。",
    });
    return true;
  }

  if (method === "PUT") {
    if (!requireChatPermission(user, "chat:approve", res)) return true;
    if (!requirePlatformOperator(user, res)) return true;
    try {
      const body = flagSchema.parse((await readJsonLimited(req)) ?? {});
      const flags = setCommunityIntegrationFlag(body.flag, body.value);
      appendChatAudit({
        action: "platform_flag_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `${body.flag}=${body.value}`,
      });
      json(res, 200, { ok: true, flags });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        err instanceof InvalidJsonError || err instanceof PayloadTooLargeError ? 400 : 422;
      appendChatAudit({
        action: "platform_flag_update",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
