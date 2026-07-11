import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { saveGmailOAuthToken } from "../src/lib/correspondence/gmail-oauth.js";
import {
  syncGmailReceive,
  type GmailApiClient,
} from "../src/lib/correspondence/gmail-receive-sync.js";
import { getMailReceivedDir } from "../src/lib/correspondence/paths.js";

const sampleEml = [
  "From: a@example.com",
  "To: b@example.com",
  "Subject: Gmail sync test",
  "Message-ID: <gmail-001@test>",
  "",
  "Body",
].join("\r\n");

function cleanup(): void {
  for (const p of [join(getDataDir(), "executive"), getExecutiveRecordsDir()]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence gmail sync", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
    writeFileSync(
      getMailConfigPath(),
      YAML.stringify({
        provider: "gmail_api",
        from: { name: "Test", email: "test@example.com" },
        receive: { sync: "gmail_api", gmail_label: "INBOX" },
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
  });

  afterEach(() => cleanup());

  it("fetches messages via mocked Gmail API client", async () => {
    const mockClient: GmailApiClient = {
      async listMessageIds() {
        return ["msg-1"];
      },
      async getMessageRaw(id) {
        return {
          id,
          internalDate: String(Date.now()),
          raw: Buffer.from(sampleEml).toString("base64"),
        };
      },
    };

    const result = await syncGmailReceive({ client: mockClient });
    expect(result.mode).toBe("gmail_api");
    expect(result.fetched).toBe(1);
    expect(result.saved).toHaveLength(1);
    const files = readdirSync(getMailReceivedDir()).filter((n) => n.endsWith(".eml"));
    expect(files.length).toBe(1);
  });

  it("returns no-op when token missing", async () => {
    cleanup();
    const result = await syncGmailReceive();
    expect(result.fetched).toBe(0);
    expect(result.message).toMatch(/not configured/i);
  });
});
