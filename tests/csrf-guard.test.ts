import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { verifySameOrigin } from "../src/lib/console-auth/csrf.js";
import type { IncomingMessage } from "node:http";

describe("csrf guard", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let testPort = 19481;
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    delete process.env.ORGOS_CSRF;
    testPort += 1;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  function start() {
    handle = startStewardChatServer({ host: "127.0.0.1", port: testPort });
    baseUrl = handle.url;
  }

  it("rejects mutating API without Origin when CSRF enabled", async () => {
    start();
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
    start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
  });

  it("allows mutating requests when ORGOS_CSRF=0", async () => {
    process.env.ORGOS_CSRF = "0";
    start();
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
});
