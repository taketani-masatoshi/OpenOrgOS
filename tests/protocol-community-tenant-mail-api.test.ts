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
} from "../src/lib/protocol/community-gmail-bind.js";
import {
  communityTenantMailApiCatalog,
  handleCommunityTenantMailBindCreate,
  handleCommunityTenantMailBindVerify,
  handleCommunityTenantMailGmailToken,
} from "../src/lib/protocol/community-tenant-mail-api.js";
import { verifyCommunityGovernanceAuth } from "../src/lib/protocol/community-wire-node-api.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { loadGmailOAuthToken } from "../src/lib/correspondence/gmail-oauth.js";
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
});
