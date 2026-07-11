import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getExecutiveRecordsDir } from "../src/lib/correspondence/paths.js";
import {
  exchangeGmailOAuthCode,
  getGmailOAuthTokenPath,
  loadGmailOAuthToken,
  buildGmailAuthorizeUrl,
} from "../src/lib/correspondence/gmail-oauth.js";

describe("correspondence gmail oauth", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    const dir = getExecutiveRecordsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    process.env.ORGOS_GMAIL_CLIENT_ID = "test-client-id";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "test-client-secret";
    process.env.ORGOS_GMAIL_REDIRECT_URI = "http://localhost:8787/oauth/gmail/callback";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    const dir = getExecutiveRecordsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("builds authorize URL when client config present", () => {
    const url = buildGmailAuthorizeUrl();
    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("gmail.send");
  });

  it("exchanges auth code and saves token with profile email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: true,
            json: async () => ({
              access_token: "access-123",
              refresh_token: "refresh-456",
              expires_in: 3600,
              token_type: "Bearer",
              scope: "gmail.send gmail.readonly",
            }),
          };
        }
        if (url.includes("gmail.googleapis.com/gmail/v1/users/me/profile")) {
          return {
            ok: true,
            json: async () => ({ emailAddress: "k.lab.masa@gmail.com" }),
          };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      })
    );

    const token = await exchangeGmailOAuthCode("auth-code-xyz");
    expect(token.access_token).toBe("access-123");
    expect(token.refresh_token).toBe("refresh-456");
    expect(token.email).toBe("k.lab.masa@gmail.com");
    expect(token.connected_via).toBe("cli");
    expect(existsSync(getGmailOAuthTokenPath())).toBe(true);
    expect(loadGmailOAuthToken()?.email).toBe("k.lab.masa@gmail.com");
    expect(loadGmailOAuthToken()?.connected_via).toBe("cli");
  });
});
