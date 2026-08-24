import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { verifySameOrigin } from "../src/lib/console-auth/csrf.js";
import type { IncomingMessage } from "node:http";

describe("csrf guard", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    delete process.env.ORGOS_CSRF;
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

  it("rejects mutating API without Origin when CSRF enabled", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/wire/flush`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("csrf_origin_mismatch");
  });

  it("exempts login from CSRF check", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows mutating requests when ORGOS_CSRF=0", async () => {
    process.env.ORGOS_CSRF = "0";
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
  });

  it("verifySameOrigin accepts matching Origin header", () => {
    const req = {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:9471",
        host: "127.0.0.1:9471",
      },
    } as IncomingMessage;
    expect(verifySameOrigin(req, "127.0.0.1:9471")).toBe(true);
  });

  it("rejects credential revoke DELETE without Origin when CSRF enabled", async () => {
    await start();
    const login = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";
    const res = await fetch(`${baseUrl}/chat/v1/auth/webauthn/credentials/some-cred`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("csrf_origin_mismatch");
  });
});
