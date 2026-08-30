import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * The tax-accountant seat is a time-boxed readonly guest. The risk is a guest
 * that outlives its engagement, or a setup link that works for anyone who finds
 * it, so these tests are about the token and the expiry.
 */
describe("steward chat guest invite HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function login(operatorId = "OP-001"): Promise<string> {
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

  it("refuses a guest setup lookup without a token", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/product/guest-setup`);
    expect(res.status).toBe(422);
  });

  it("refuses a guest setup token that was never issued", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/product/guest-setup?token=not-a-real-token`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("requires a display name and an email to invite a seat", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/product/admin/operators`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ role: "readonly", guest_expires_at: "2027-03-31" }),
    });
    expect(res.status, await res.clone().text()).toBe(422);
  });

  it("refuses to invite a seat for a non-ceo operator", async () => {
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/product/admin/operators`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        display_name: "税理士",
        email: "zeirishi@example.com",
        role: "readonly",
        guest_expires_at: "2027-03-31",
      }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
