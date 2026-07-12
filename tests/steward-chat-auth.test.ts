import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat auth", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("rejects /chat/v1/today without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/today`);
    expect(res.status).toBe(401);
  });

  it("allows login and then fetches today", async () => {
    await start();
    const loginRes = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = loginRes.headers.get("set-cookie");
    expect(cookie).toContain("orgos_wire_session");

    const todayRes = await fetch(`${baseUrl}/chat/v1/today`, {
      headers: { Cookie: cookie ?? "" },
    });
    expect(todayRes.status).toBe(200);
    const body = (await todayRes.json()) as { tenant: string };
    expect(body.tenant).toBe("demo");
  });

  it("bypasses auth when STEWARD_CHAT_AUTH=0", async () => {
    process.env.STEWARD_CHAT_AUTH = "0";
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/today`);
    expect(res.status).toBe(200);
  });
});
