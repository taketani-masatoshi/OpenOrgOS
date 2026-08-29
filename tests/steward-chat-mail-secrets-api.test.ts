import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  mailSecretsFilePath,
  resetMailSecretsHydrationForTest,
} from "../src/lib/correspondence/mail-secrets-store.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat mail secrets api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_CHAT_AUDIT = "0";
    rmSync(mailSecretsFilePath(), { force: true });
    resetMailSecretsHydrationForTest();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    rmSync(mailSecretsFilePath(), { force: true });
    resetMailSecretsHydrationForTest();
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("rejects secret writes without chat:approve", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/mail/secrets`, {
      method: "PUT",
      headers: {
        Cookie: cookieFor("OP-READONLY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ORGOS_SMTP_PASSWORD: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("stores secrets and never echoes them back", async () => {
    await start();
    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };

    const bad = await fetch(`${baseUrl}/chat/v1/mail/secrets`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ NOT_A_MAIL_KEY: "x" }),
    });
    expect(bad.status).toBe(422);

    const res = await fetch(`${baseUrl}/chat/v1/mail/secrets`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        ORGOS_SMTP_USER: "ops@example.com",
        ORGOS_SMTP_PASSWORD: "super-secret-password",
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("super-secret-password");
    expect(text).toContain("smtp_password_configured");

    const status = await fetch(`${baseUrl}/chat/v1/mail/gmail`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    const body = await status.text();
    expect(body).toContain("smtp_password_configured");
    expect(body).not.toContain("super-secret-password");
  });
});
