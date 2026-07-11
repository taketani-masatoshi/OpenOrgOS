import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { createCommunityGmailBind } from "../src/lib/protocol/community-gmail-bind.js";
import { handleCommunityTenantMailGmailToken } from "../src/lib/protocol/community-tenant-mail-api.js";
import { loadGmailOAuthToken, resolveGmailAccessToken } from "../src/lib/correspondence/gmail-oauth.js";
import { sendCorrespondenceEmail } from "../src/lib/correspondence/mail-send.js";
import type { CorrespondenceDraft } from "../schemas/correspondence/draft.js";

describe("community gmail connect smoke", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    for (const p of [join(getDataDir(), "protocol"), getExecutiveRecordsDir()]) {
      if (existsSync(p)) rmSync(p, { recursive: true, force: true });
      mkdirSync(p, { recursive: true });
    }
    process.env.ORGOS_GMAIL_CLIENT_ID = "shared-client";
    process.env.ORGOS_GMAIL_CLIENT_SECRET = "shared-secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
          return { ok: true, json: async () => ({ id: "community-smoke-001" }) };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...env };
  });

  it("token push via community API then sends mail with gmail_api", async () => {
    const entry = createCommunityGmailBind("demo");
    const push = handleCommunityTenantMailGmailToken(
      {
        tenant_id: "demo",
        nonce: entry.nonce,
        oauth_client_id: "shared-client",
        community_user_email: "ceo@example.com",
        token: {
          version: 1,
          access_token: "access-smoke",
          refresh_token: "refresh-smoke",
          token_type: "Bearer",
          email: "ceo@example.com",
        },
      },
      true
    );
    expect(push.ok).toBe(true);

    setTenantId("demo");
    const saved = loadGmailOAuthToken();
    expect(saved?.connected_via).toBe("community");
    expect(readFileSync(getMailConfigPath(), "utf-8")).toContain("gmail_api");

    const token = await resolveGmailAccessToken();
    expect(token).toBe("access-smoke");

    const draft: CorrespondenceDraft = {
      draft_id: "DRAFT-smoke-001",
      channel: "email",
      status: "approved",
      created_at: new Date().toISOString(),
      created_by: "test-operator",
      to: "recipient@example.com",
      subject: "Community connect smoke",
      body: "After Option B push",
    };
    const result = await sendCorrespondenceEmail(draft);
    expect(result.mode).toBe("gmail_api");
    expect(result.messageId).toBe("community-smoke-001");
  });
});
