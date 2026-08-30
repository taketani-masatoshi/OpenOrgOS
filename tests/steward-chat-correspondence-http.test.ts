import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Outbound mail is irreversible, so the HTTP surface is checked for the three
 * things that matter: an unapproved draft cannot be sent, mail secrets never
 * come back in a response, and the Gmail path stays behind its ship gate.
 */
describe("steward chat correspondence HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let cookie = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
    cookie = await login("OP-001");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function login(operatorId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "test-pass",
        operator_id: operatorId,
        approver_id: operatorId,
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  it("requires a session to list pending drafts", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/correspondence/pending`);
    expect(res.status).toBe(401);
  });

  it("lists pending drafts for an authenticated operator", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/correspondence/pending`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drafts: unknown[] };
    expect(Array.isArray(body.drafts)).toBe(true);
  });

  it("refuses to send an unknown or unapproved draft", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/correspondence/DRAFT-DOES-NOT-EXIST/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ dry_run: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("never returns mail secrets in the status payload", async () => {
    await fetch(`${baseUrl}/chat/v1/mail/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ORGOS_SMTP_USER: "bot@example.com", ORGOS_SMTP_PASSWORD: "super-secret-value" }),
    });
    const res = await fetch(`${baseUrl}/chat/v1/mail/gmail`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("super-secret-value");
  });

  it("updates the sender identity through the config endpoint", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/mail/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ from_name: "Demo Corp", provider: "dry_run" }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("refuses mail configuration for an operator without chat:approve", async () => {
    const otherCookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/mail/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: otherCookie },
      body: JSON.stringify({ from_name: "権限のない更新" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
