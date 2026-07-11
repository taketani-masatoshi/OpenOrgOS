import type { IncomingMessage } from "node:http";
import { setTenantId } from "../tenant.js";
import { gmailOAuthTokenSchema } from "../../../schemas/correspondence/gmail-oauth.js";
import { saveGmailOAuthToken, ensureGmailOAuthClientForCommunity } from "../correspondence/gmail-oauth.js";
import { writeGmailApiMailConfig } from "../correspondence/gmail-setup-wizard.js";
import {
  claimCommunityGmailBind,
  createCommunityGmailBind,
  verifyCommunityGmailBind,
} from "./community-gmail-bind.js";
import { verifyCommunityGovernanceAuth } from "./community-wire-node-api.js";

export interface CommunityGmailTokenBody {
  tenant_id: string;
  nonce: string;
  community_user_id?: string;
  community_user_email?: string;
  oauth_client_id?: string;
  from_name?: string;
  token: unknown;
}

export interface CommunityGmailBindCreateBody {
  tenant_id: string;
  ttl_minutes?: number;
  issued_for_emails?: string[];
}

function parseJsonBody<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function handleCommunityTenantMailBindVerify(
  tenantId: string,
  nonce: string
): { ok: boolean; tenant_id?: string; expires_at?: string; error?: string } {
  const verified = verifyCommunityGmailBind(tenantId, nonce);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }
  return {
    ok: true,
    tenant_id: verified.entry.tenant_id,
    expires_at: verified.entry.expires_at,
  };
}

export function handleCommunityTenantMailGmailToken(
  body: CommunityGmailTokenBody,
  authorized: boolean
): { ok: boolean; tenant_id?: string; email?: string; error?: string; status?: number } {
  if (!authorized) {
    return {
      ok: false,
      error: "unauthorized — ORGOS_COMMUNITY_GOVERNANCE_TOKEN required",
      status: 401,
    };
  }

  const tenantId = body.tenant_id?.trim();
  const nonce = body.nonce?.trim();
  if (!tenantId || !nonce) {
    return { ok: false, error: "tenant_id and nonce required", status: 422 };
  }

  const verified = verifyCommunityGmailBind(tenantId, nonce);
  if (!verified.ok) {
    return { ok: false, error: verified.error, status: 422 };
  }

  const clientCheck = ensureGmailOAuthClientForCommunity(body.oauth_client_id?.trim());
  if (!clientCheck.ok) {
    return { ok: false, error: clientCheck.error, status: 422 };
  }

  let token;
  try {
    token = gmailOAuthTokenSchema.parse({
      ...(body.token as object),
      connected_via: "community",
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "invalid gmail token payload",
      status: 422,
    };
  }

  if (!token.refresh_token) {
    return { ok: false, error: "refresh_token required for OrgOS mail", status: 422 };
  }

  if (!token.email) {
    return { ok: false, error: "token.email required (Gmail profile)", status: 422 };
  }

  const previousTenant = process.env.ORGOS_TENANT;
  setTenantId(tenantId);
  try {
    const claimed = claimCommunityGmailBind(tenantId, nonce, {
      communityUserId: body.community_user_id,
      communityUserEmail: body.community_user_email,
    });
    if (!claimed.ok) {
      return { ok: false, error: claimed.error, status: 422 };
    }

    saveGmailOAuthToken(token);
    writeGmailApiMailConfig({
      fromEmail: token.email,
      fromName: body.from_name?.trim() || "OrgOS Secretary",
    });
  } finally {
    if (previousTenant) setTenantId(previousTenant);
  }

  return { ok: true, tenant_id: tenantId, email: token.email };
}

export function handleCommunityTenantMailBindCreate(
  body: CommunityGmailBindCreateBody,
  authorized: boolean
): {
  ok: boolean;
  tenant_id?: string;
  nonce?: string;
  expires_at?: string;
  error?: string;
  status?: number;
} {
  if (!authorized) {
    return {
      ok: false,
      error: "unauthorized — ORGOS_COMMUNITY_GOVERNANCE_TOKEN required",
      status: 401,
    };
  }
  const tenantId = body.tenant_id?.trim();
  if (!tenantId) {
    return { ok: false, error: "tenant_id required", status: 422 };
  }
  const entry = createCommunityGmailBind(tenantId, body.ttl_minutes ?? 30, {
    issuedForEmails: body.issued_for_emails,
  });
  return {
    ok: true,
    tenant_id: entry.tenant_id,
    nonce: entry.nonce,
    expires_at: entry.expires_at,
  };
}

export function communityTenantMailApiCatalog(): {
  version: string;
  base_path: string;
  routes: Array<{ method: string; path: string; auth?: string; description: string }>;
} {
  return {
    version: "1",
    base_path: "/protocol/v1/community/tenant-mail",
    routes: [
      {
        method: "GET",
        path: "/protocol/v1/community/tenant-mail/bind",
        description: "Verify community Gmail bind nonce (tenant_id + nonce query)",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/tenant-mail/bind",
        auth: "Bearer ORGOS_COMMUNITY_GOVERNANCE_TOKEN",
        description: "Create bind nonce for Community Gmail connect flow",
      },
      {
        method: "POST",
        path: "/protocol/v1/community/tenant-mail/gmail-token",
        auth: "Bearer ORGOS_COMMUNITY_GOVERNANCE_TOKEN",
        description: "Push Gmail OAuth token to tenant records/executive/gmail-oauth.json",
      },
    ],
  };
}

export async function handleCommunityTenantMailApiRoute(
  method: string,
  pathname: string,
  rawBody: string,
  req: IncomingMessage,
  searchParams: URLSearchParams
): Promise<{ status: number; body: unknown } | null> {
  if (pathname === "/protocol/v1/community/tenant-mail/bind" && method === "GET") {
    const tenantId = searchParams.get("tenant_id") ?? "";
    const nonce = searchParams.get("nonce") ?? "";
    const result = handleCommunityTenantMailBindVerify(tenantId, nonce);
    return { status: result.ok ? 200 : 422, body: result };
  }

  if (pathname === "/protocol/v1/community/tenant-mail/bind" && method === "POST") {
    try {
      const data = parseJsonBody<CommunityGmailBindCreateBody>(rawBody);
      const result = handleCommunityTenantMailBindCreate(
        data,
        verifyCommunityGovernanceAuth(req)
      );
      return { status: result.status ?? (result.ok ? 201 : 422), body: result };
    } catch (e) {
      return {
        status: 400,
        body: { ok: false, error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  if (pathname === "/protocol/v1/community/tenant-mail/gmail-token" && method === "POST") {
    try {
      const data = parseJsonBody<CommunityGmailTokenBody>(rawBody);
      const result = handleCommunityTenantMailGmailToken(
        data,
        verifyCommunityGovernanceAuth(req)
      );
      return { status: result.status ?? (result.ok ? 200 : 422), body: result };
    } catch (e) {
      return {
        status: 400,
        body: { ok: false, error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  if (pathname === "/protocol/v1/community/tenant-mail" && method === "GET") {
    return { status: 200, body: communityTenantMailApiCatalog() };
  }

  return null;
}
