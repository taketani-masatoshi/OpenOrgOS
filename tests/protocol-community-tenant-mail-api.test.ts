import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { IncomingMessage } from "node:http";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import {
  createCommunityGmailBind,
  verifyCommunityGmailBind,
  claimCommunityGmailBind,
} from "../src/lib/protocol/community-gmail-bind.js";
import {
  communityTenantMailApiCatalog,
  handleCommunityTenantMailBindCreate,
  handleCommunityTenantMailBindVerify,
  handleCommunityTenantMailGmailToken,
} from "../src/lib/protocol/community-tenant-mail-api.js";
import { verifyCommunityGovernanceAuth } from "../src/lib/protocol/community-wire-node-api.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { loadGmailOAuthToken, saveGmailOAuthClientConfig } from "../src/lib/correspondence/gmail-oauth.js";
import { gmailOAuthTokenSchema } from "../schemas/correspondence/gmail-oauth.js";

function mockReq(authHeader?: string): IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as IncomingMessage;
}

describe("community tenant-mail API", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    mkdirSync(protocolDir, { recursive: true });
    const recordsDir = getExecutiveRecordsDir();
    if (existsSync(recordsDir)) rmSync(recordsDir, { recursive: true, force: true });
    mkdirSync(recordsDir, { recursive: true });
    delete process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN;
    delete process.env.NODE_ENV;
    delete process.env.ORGOS_STRICT_TRUST;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    const recordsDir = getExecutiveRecordsDir();
    if (existsSync(recordsDir)) rmSync(recordsDir, { recursive: true, force: true });
  });

  it("exports tenant-mail API catalog", () => {
    const catalog = communityTenantMailApiCatalog();
    expect(catalog.base_path).toBe("/protocol/v1/community/tenant-mail");
    expect(catalog.routes.some((r) => r.path.endsWith("/gmail-token"))).toBe(true);
  });

  it("verifies valid bind nonce", () => {
    const entry = createCommunityGmailBind("demo");
    const result = handleCommunityTenantMailBindVerify("demo", entry.nonce);
    expect(result.ok).toBe(true);
    expect(result.tenant_id).toBe("demo");
    expect(result.expires_at).toBe(entry.expires_at);
  });

  it("rejects unknown bind nonce", () => {
    const result = handleCommunityTenantMailBindVerify("demo", "deadbeef".repeat(3));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("bind not found");
  });

  it("creates bind with governance auth", () => {
    process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN = "gov-test-token";
    const unauthorized = handleCommunityTenantMailBindCreate(
      { tenant_id: "demo" },
      verifyCommunityGovernanceAuth(mockReq())
    );
    expect(unauthorized.ok).toBe(false);
    expect(unauthorized.status).toBe(401);

    const authorized = handleCommunityTenantMailBindCreate(
      { tenant_id: "demo" },
      verifyCommunityGovernanceAuth(mockReq("Bearer gov-test-token"))
    );
    expect(authorized.ok).toBe(true);
    expect(authorized.nonce?.length).toBeGreaterThan(16);
    expect(verifyCommunityGmailBind("demo", authorized.nonce!)).toEqual(
      expect.objectContaining({ ok: true })
    );
  });

  it("pushes gmail token and consumes bind", () => {
    process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN = "gov-test-token";
    process.env.ORGOS_GMAIL_CLIENT_ID = "community-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "secret";
    const entry = createCommunityGmailBind("demo");
    const tokenPayload = {
      version: 1,
      access_token: "access-abc",
      refresh_token: "refresh-xyz",
      token_type: "Bearer",
      email: "user@example.com",
    };

    const unauthorized = handleCommunityTenantMailGmailToken(
      { tenant_id: "demo", nonce: entry.nonce, token: tokenPayload },
      false
    );
    expect(unauthorized.ok).toBe(false);
    expect(unauthorized.status).toBe(401);

    const result = handleCommunityTenantMailGmailToken(
      {
        tenant_id: "demo",
        nonce: entry.nonce,
        community_user_id: "comm-user-1",
        from_name: "Demo Secretary",
        token: tokenPayload,
      },
      true
    );
    expect(result).toMatchObject({ ok: true, email: "user@example.com" });

    setTenantId("demo");
    const saved = loadGmailOAuthToken();
    expect(saved?.email).toBe("user@example.com");
    expect(saved?.connected_via).toBe("community");
    expect(gmailOAuthTokenSchema.parse(saved).connected_via).toBe("community");

    const mailConfig = readFileSync(getMailConfigPath(), "utf-8");
    expect(mailConfig).toContain("gmail_api");
    expect(mailConfig).toContain("user@example.com");

    expect(verifyCommunityGmailBind("demo", entry.nonce).ok).toBe(false);
  });

  it("rejects gmail token push without refresh_token", () => {
    process.env.ORGOS_GMAIL_CLIENT_ID = "community-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "secret";
    const entry = createCommunityGmailBind("demo");
    const result = handleCommunityTenantMailGmailToken(
      {
        tenant_id: "demo",
        nonce: entry.nonce,
        token: {
          version: 1,
          access_token: "access-only",
          email: "user@example.com",
        },
      },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("refresh_token");
  });

  it("claims bind before saving token and rejects replay", () => {
    process.env.ORGOS_GMAIL_CLIENT_ID = "community-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "secret";
    const entry = createCommunityGmailBind("demo");
    const payload = {
      tenant_id: "demo",
      nonce: entry.nonce,
      oauth_client_id: "community-client",
      token: {
        version: 1,
        access_token: "access-abc",
        refresh_token: "refresh-xyz",
        token_type: "Bearer",
        email: "user@example.com",
      },
    };

    const first = handleCommunityTenantMailGmailToken(payload, true);
    expect(first.ok).toBe(true);

    const replay = handleCommunityTenantMailGmailToken(payload, true);
    expect(replay.ok).toBe(false);
    expect(replay.error).toContain("already used");
  });

  it("rejects community user email outside issued_for_emails", () => {
    process.env.ORGOS_GMAIL_CLIENT_ID = "community-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "secret";
    const entry = createCommunityGmailBind("demo", 30, {
      issuedForEmails: ["ceo@example.com"],
    });
    const result = handleCommunityTenantMailGmailToken(
      {
        tenant_id: "demo",
        nonce: entry.nonce,
        community_user_email: "other@example.com",
        oauth_client_id: "community-client",
        token: {
          version: 1,
          access_token: "access-abc",
          refresh_token: "refresh-xyz",
          email: "other@example.com",
        },
      },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not authorized");
  });

  it("rejects oauth client id mismatch", () => {
    saveGmailOAuthClientConfig({
      version: 1,
      client_id: "steward-client",
      client_secret: "secret",
    });
    const entry = createCommunityGmailBind("demo");
    const result = handleCommunityTenantMailGmailToken(
      {
        tenant_id: "demo",
        nonce: entry.nonce,
        oauth_client_id: "community-client",
        token: {
          version: 1,
          access_token: "access-abc",
          refresh_token: "refresh-xyz",
          email: "user@example.com",
        },
      },
      true
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("client id mismatch");
  });

  it("claimCommunityGmailBind consumes atomically", () => {
    const entry = createCommunityGmailBind("demo");
    const claimed = claimCommunityGmailBind("demo", entry.nonce, {
      communityUserId: "user-1",
    });
    expect(claimed.ok).toBe(true);
    expect(verifyCommunityGmailBind("demo", entry.nonce).ok).toBe(false);
  });
});

describe("protocol API tenant-mail routes", () => {
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
    close = undefined;
  });

  it("serves GET /protocol/v1/community/tenant-mail catalog", async () => {
    const server = await startProtocolApiServer({ host: "127.0.0.1", port: 0 });
    close = server.close;

    const res = await fetch(`${server.url}/protocol/v1/community/tenant-mail`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { base_path?: string; routes?: unknown[] };
    expect(body.base_path).toBe("/protocol/v1/community/tenant-mail");
    expect(body.routes?.length).toBeGreaterThan(0);
  });

  it("POST bind and gmail-token over HTTP with governance auth", async () => {
    process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN = "gov-http-test";
    process.env.ORGOS_GMAIL_CLIENT_ID = "http-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "http-secret";
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    mkdirSync(protocolDir, { recursive: true });
    const recordsDir = getExecutiveRecordsDir();
    if (existsSync(recordsDir)) rmSync(recordsDir, { recursive: true, force: true });
    mkdirSync(recordsDir, { recursive: true });

    const server = await startProtocolApiServer({ host: "127.0.0.1", port: 0 });
    close = server.close;

    const bindRes = await fetch(`${server.url}/protocol/v1/community/tenant-mail/bind`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gov-http-test",
      },
      body: JSON.stringify({ tenant_id: "demo", issued_for_emails: ["ceo@example.com"] }),
    });
    expect(bindRes.status).toBe(201);
    const bindBody = (await bindRes.json()) as { nonce?: string };
    expect(bindBody.nonce).toBeTruthy();

    const pushRes = await fetch(`${server.url}/protocol/v1/community/tenant-mail/gmail-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gov-http-test",
      },
      body: JSON.stringify({
        tenant_id: "demo",
        nonce: bindBody.nonce,
        community_user_email: "ceo@example.com",
        oauth_client_id: "http-client",
        token: {
          version: 1,
          access_token: "access-http",
          refresh_token: "refresh-http",
          email: "ceo@example.com",
        },
      }),
    });
    expect(pushRes.ok).toBe(true);
    setTenantId("demo");
    expect(loadGmailOAuthToken()?.connected_via).toBe("community");
  });
});
