import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { saveGmailOAuthToken } from "../src/lib/correspondence/gmail-oauth.js";
import { sendCorrespondenceEmail } from "../src/lib/correspondence/mail-send.js";
import type { CorrespondenceDraft } from "../schemas/correspondence/draft.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "executive"), getExecutiveRecordsDir()]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence gmail send", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
    writeFileSync(
      getMailConfigPath(),
      YAML.stringify({
        provider: "gmail_api",
        from: { name: "Test Secretary", email: "secretary@example.com" },
      }),
      "utf-8"
    );
    saveGmailOAuthToken({
      version: 1,
      access_token: "test-access-token",
      refresh_token: "test-refresh",
      token_type: "Bearer",
      expiry_date: Date.now() + 3_600_000,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
          return {
            ok: true,
            json: async () => ({ id: "gmail-sent-001" }),
          };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    process.env = { ...env };
  });

  it("sends correspondence via Gmail API users.messages.send", async () => {
    const draft: CorrespondenceDraft = {
      draft_id: "DRAFT-20260710-001",
      channel: "email",
      status: "approved",
      created_at: new Date().toISOString(),
      created_by: "test-operator",
      to: "recipient@example.com",
      subject: "Test subject",
      body: "Test body",
    };

    const result = await sendCorrespondenceEmail(draft);
    expect(result.mode).toBe("gmail_api");
    expect(result.messageId).toBe("gmail-sent-001");
    expect(fetch).toHaveBeenCalled();
  });
});
