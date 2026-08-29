import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { resetRateLimitState } from "../src/lib/console-auth/rate-limit.js";

describe("rate limit", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    resetRateLimitState();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    delete process.env.ORGOS_RATE_LIMIT;
    process.env.ORGOS_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.ORGOS_RATE_LIMIT_LOGIN_MAX = "3";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    resetRateLimitState();
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("returns 429 when login rate limit exceeded", async () => {
    await start();
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: "test-pass" }),
      });
      expect(res.status).toBe(200);
    }

    const blocked = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limit_exceeded");
  });

  it("allows requests when ORGOS_RATE_LIMIT=0", async () => {
    process.env.ORGOS_RATE_LIMIT = "0";
    process.env.ORGOS_RATE_LIMIT_LOGIN_MAX = "1";
    await start();

    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: "test-pass" }),
      });
      expect(res.status).toBe(200);
    }
  });

  it("isolates counters per X-OrgOS-Tenant", async () => {
    process.env.ORGOS_RATE_LIMIT_LOGIN_MAX = "2";
    await start();

    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OrgOS-Tenant": "tenant-a",
        },
        body: JSON.stringify({ passkey: "test-pass" }),
      });
      expect(res.status).toBe(200);
    }

    const blockedA = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrgOS-Tenant": "tenant-a",
      },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(blockedA.status).toBe(429);
    const body = (await blockedA.json()) as { tenant_id: string | null };
    expect(body.tenant_id).toBe("tenant-a");

    const allowedB = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OrgOS-Tenant": "tenant-b",
      },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(allowedB.status).toBe(200);
  });
});
