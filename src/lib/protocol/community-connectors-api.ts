/**
 * Community connector protocol routes (Slack / Asana / Drive / Gmail).
 * Path: src/lib/protocol/community-connectors-api.ts
 *
 * Community brokers the OAuth dance and pushes the resulting token here. The
 * governance bearer proves "this is our Community"; the bind nonce proves "an
 * operator of this tenant asked for it". Both are required.
 */
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import {
  connectorProviderSchema,
  connectorTokenSchema,
  type ConnectorProvider,
} from "../../../schemas/connectors.js";
import { getTenantId, setTenantId } from "../tenant.js";
import { saveConnectorToken } from "../integrations/connector-store.js";
import {
  claimConnectorBind,
  createConnectorBind,
  verifyConnectorBind,
} from "./community-connector-bind.js";
import { verifyCommunityGovernanceAuth } from "./community-wire-node-api.js";

export interface ConnectorApiResult {
  ok: boolean;
  status?: number;
  error?: string;
  [key: string]: unknown;
}

const bindCreateSchema = z.object({
  provider: connectorProviderSchema,
  tenant_id: z.string().min(1),
  ttl_minutes: z.number().int().positive().max(24 * 60).optional(),
  issued_for_emails: z.array(z.string().email()).optional(),
});

const tokenPushSchema = z.object({
  provider: connectorProviderSchema,
  tenant_id: z.string().min(1),
  nonce: z.string().min(1),
  community_user_id: z.string().optional(),
  community_user_email: z.string().email().optional(),
  token: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    token_type: z.string().optional(),
    expiry_date: z.number().int().optional(),
    scope: z.string().optional(),
    account_label: z.string().optional(),
    account_id: z.string().optional(),
  }),
});

const UNAUTHORIZED: ConnectorApiResult = {
  ok: false,
  status: 401,
  error: "unauthorized — ORGOS_COMMUNITY_GOVERNANCE_TOKEN required",
};

/**
 * Gmail keeps its dedicated tenant-mail route because it also writes
 * mail-config; pushing a Gmail token here would bypass that.
 */
function rejectsGmailTokenPush(provider: ConnectorProvider): ConnectorApiResult | null {
  if (provider !== "gmail") return null;
  return {
    ok: false,
    status: 422,
    error: "gmail tokens must use /protocol/v1/community/tenant-mail/gmail-token",
  };
}

export function handleConnectorBindVerify(
  provider: string,
  tenantId: string,
  nonce: string,
): ConnectorApiResult {
  const parsed = connectorProviderSchema.safeParse(provider);
  if (!parsed.success) return { ok: false, status: 422, error: "unknown connector provider" };
  const verified = verifyConnectorBind(parsed.data, tenantId, nonce);
  if (!verified.ok) return { ok: false, status: 422, error: verified.error };
  return {
    ok: true,
    provider: verified.bind.provider,
    tenant_id: verified.bind.tenant_id,
    expires_at: verified.bind.expires_at,
  };
}

export function handleConnectorBindCreate(
  body: unknown,
  authorized: boolean,
): ConnectorApiResult {
  if (!authorized) return UNAUTHORIZED;
  const parsed = bindCreateSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 422, error: parsed.error.issues[0]?.message ?? "invalid body" };
  }
  const bind = createConnectorBind(parsed.data.provider, parsed.data.tenant_id, {
    ttlMinutes: parsed.data.ttl_minutes,
    issuedForEmails: parsed.data.issued_for_emails,
  });
  return {
    ok: true,
    provider: bind.provider,
    tenant_id: bind.tenant_id,
    nonce: bind.nonce,
    expires_at: bind.expires_at,
  };
}

export function handleConnectorTokenPush(body: unknown, authorized: boolean): ConnectorApiResult {
  if (!authorized) return UNAUTHORIZED;
  const parsed = tokenPushSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 422, error: parsed.error.issues[0]?.message ?? "invalid body" };
  }
  const { provider, tenant_id: tenantId, nonce } = parsed.data;

  const gmailRejection = rejectsGmailTokenPush(provider);
  if (gmailRejection) return gmailRejection;

  // Restore the tenant that was actually active, which is not necessarily the
  // one named in the environment.
  const previousTenant = getTenantId();
  setTenantId(tenantId);
  try {
    const claimed = claimConnectorBind(provider, tenantId, nonce, {
      communityUserId: parsed.data.community_user_id,
      communityUserEmail: parsed.data.community_user_email,
    });
    if (!claimed.ok) return { ok: false, status: 422, error: claimed.error };

    const token = connectorTokenSchema.parse({
      ...parsed.data.token,
      provider,
      connected_via: "community",
    });
    saveConnectorToken(token);
    return {
      ok: true,
      provider,
      tenant_id: tenantId,
      account_label: token.account_label,
    };
  } catch (err) {
    return {
      ok: false,
      status: 422,
      error: err instanceof Error ? err.message : "invalid connector token payload",
    };
  } finally {
    setTenantId(previousTenant);
  }
}

export function communityConnectorsApiCatalog(): {
  version: string;
  base_path: string;
  routes: Array<{ method: string; path: string; auth?: string; description: string }>;
} {
  return {
    version: "1",
    base_path: "/protocol/v1/community/connectors",
    routes: [
      {
        method: "GET",
        path: "/protocol/v1/community/connectors/bind",
        description: "Verify a connector bind nonce (provider + tenant_id + nonce query)",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/connectors/bind",
        auth: "Bearer ORGOS_COMMUNITY_GOVERNANCE_TOKEN",
        description: "Create a bind nonce for the Community connector OAuth flow",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/connectors/token",
        auth: "Bearer ORGOS_COMMUNITY_GOVERNANCE_TOKEN",
        description: "Push a connector OAuth token to records/integrations/{provider}-oauth.json",
      },
    ],
  };
}

export async function handleCommunityConnectorsApiRoute(
  method: string,
  pathname: string,
  rawBody: string,
  req: IncomingMessage,
  searchParams: URLSearchParams,
): Promise<{ status: number; body: unknown } | null> {
  if (!pathname.startsWith("/protocol/v1/community/connectors")) return null;

  const respond = (result: ConnectorApiResult, okStatus = 200) => {
    const { status, ...body } = result;
    return { status: status ?? (result.ok ? okStatus : 422), body };
  };

  if (pathname === "/protocol/v1/community/connectors/bind" && method === "GET") {
    return respond(
      handleConnectorBindVerify(
        searchParams.get("provider") ?? "",
        searchParams.get("tenant_id") ?? "",
        searchParams.get("nonce") ?? "",
      ),
    );
  }

  if (pathname === "/protocol/v1/community/connectors/bind" && method === "POST") {
    try {
      return respond(
        handleConnectorBindCreate(JSON.parse(rawBody), verifyCommunityGovernanceAuth(req)),
        201,
      );
    } catch (err) {
      return { status: 400, body: { ok: false, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  if (pathname === "/protocol/v1/community/connectors/token" && method === "POST") {
    try {
      return respond(
        handleConnectorTokenPush(JSON.parse(rawBody), verifyCommunityGovernanceAuth(req)),
      );
    } catch (err) {
      return { status: 400, body: { ok: false, error: err instanceof Error ? err.message : String(err) } };
    }
  }

  if (pathname === "/protocol/v1/community/connectors" && method === "GET") {
    return { status: 200, body: communityConnectorsApiCatalog() };
  }

  return null;
}
