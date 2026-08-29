import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  type StewardChatServerHandle,
  STEWARD_CHAT_SPA_DIST,
} from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { startOperatorConsoleServer } from "../src/lib/operator-console/combined-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { resetRateLimitState } from "../src/lib/console-auth/rate-limit.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("steward chat abnormal paths", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    resetRateLimitState();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_RATE_LIMIT = "0";
    process.env.ORGOS_LLM_MOCK = "1";
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

  async function loginCookie(): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass", operator_id: "CEO", approver_id: "CEO" }),
    });
    expect(res.status).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  it("A-01: rejects wrong dev passkey with 401", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "wrong-pass" }),
    });
    expect(res.status).toBe(401);
  });

  it("A-02: rejects invalid session cookie on /chat/v1/today", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/today`, {
      headers: { Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=invalid-token-xyz` },
    });
    expect(res.status).toBe(401);
  });

  it("A-03: rejects empty chat message body with 400", async () => {
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid body");
  });

  it("A-04: rejects malformed JSON on chat message with 400", async () => {
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("A-05: returns 400 for nonexistent approval approve", async () => {
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/approvals/nonexistent-approval-id/approve`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  it("A-06: witness register rejects missing event_id with 422", async () => {
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/wire/witness/register`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ side: "sent" }),
    });
    expect(res.status).toBe(422);
  });

  it("A-07: witness register rejects invalid side with 422", async () => {
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/wire/witness/register`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({
        event_id: "00000000-0000-4000-8000-000000000001",
        side: "invalid",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("A-08: returns 403 for prod guest on approve", async () => {
    await start();
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "not-in-company-yaml",
      mode: "prod",
    });
    const res = await fetch(`${baseUrl}/chat/v1/approvals/any-id/approve`, {
      method: "POST",
      headers: {
        Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`,
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("A-09: returns 429 on ask rate limit when enabled", async () => {
    process.env.ORGOS_RATE_LIMIT = "1";
    delete process.env.ORGOS_RATE_LIMIT_ASK_MAX;
    process.env.ORGOS_RATE_LIMIT_ASK_MAX = "2";
    await start();
    const cookie = await loginCookie();
    const headers = { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl };

    for (let i = 0; i < 2; i++) {
      const ok = await fetch(`${baseUrl}/chat/v1/message`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: `ping ${i}` }),
      });
      expect(ok.status).toBe(200);
    }

    const blocked = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "blocked" }),
    });
    expect(blocked.status).toBe(429);
  });

  it("A-10: rejects CSRF on wire flush with foreign Origin", async () => {
    delete process.env.ORGOS_CSRF;
    await start();
    const cookie = await loginCookie();
    const res = await fetch(`${baseUrl}/chat/v1/wire/flush`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: "https://evil.example.com",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("csrf_origin_mismatch");
  });

  it("A-11: prod mode rejects dev passkey login with 403", async () => {
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "legacy_token";
    process.env.WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN = "1";
    process.env.WIRE_CONSOLE_PROD_TOKEN = "prod-secret";
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(403);
  });

  it("A-12: operator stats requires auth", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/operator/stats`);
    expect(res.status).toBe(401);
  });

  it("A-17: rejects session after logout", async () => {
    await start();
    const cookie = await loginCookie();
    const logout = await fetch(`${baseUrl}/chat/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: baseUrl },
    });
    expect(logout.status).toBe(200);
    const after = await fetch(`${baseUrl}/chat/v1/today`, { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });
});

describe("operator console abnormal paths", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    resetRateLimitState();
    mkdirSync(STEWARD_CHAT_SPA_DIST, { recursive: true });
    writeFileSync(join(STEWARD_CHAT_SPA_DIST, "index.html"), "<html></html>");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_RATE_LIMIT = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    delete process.env.ORGOS_ENV;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("A-13: unauthenticated unknown chat API returns 401 not SPA", async () => {
    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${handle.url}/chat/v1/unknown-endpoint`);
      expect(res.status).toBe(401);
    } finally {
      await new Promise<void>((r) => handle.close(r));
    }
  });

  it("A-14: combined server rejects unauthenticated /chat/v1/today", async () => {
    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${handle.url}/chat/v1/today`);
      expect(res.status).toBe(401);
    } finally {
      await new Promise<void>((r) => handle.close(r));
    }
  });

  it("A-15: authenticated unknown chat API returns 404 JSON not SPA", async () => {
    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    try {
      const loginRes = await fetch(`${handle.url}/chat/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: "test-pass" }),
      });
      const cookie = loginRes.headers.get("set-cookie") ?? "";
      const res = await fetch(`${handle.url}/chat/v1/unknown-endpoint`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("not found");
      expect(res.headers.get("content-type")).toContain("application/json");
    } finally {
      await new Promise<void>((r) => handle.close(r));
    }
  });

  it("A-16: steward chat unknown API returns 404 after auth", async () => {
    setTenantId("demo");
    resetRateLimitState();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    const chat = await startStewardChatForTest();
    try {
      const loginRes = await fetch(`${chat.url}/chat/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: "test-pass" }),
      });
      const cookie = loginRes.headers.get("set-cookie") ?? "";
      const res = await fetch(`${chat.url}/chat/v1/no-such-route`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((r) => chat.close(r));
    }
  });
});
