import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import {
  hasChatPermission,
  resolveChatPermissions,
} from "../src/lib/console-auth/rbac.js";

describe("chat rbac", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let testPort = 19501;
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
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

  it("grants all permissions to dev sessions", () => {
    const perms = resolveChatPermissions({
      operator_id: "op",
      approver_id: "CEO",
      mode: "dev",
    });
    expect(perms).toContain("chat:approve");
    expect(perms).toContain("chat:wire");
  });

  it("restricts prod non-approver to read and ask", () => {
    const perms = resolveChatPermissions({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    expect(perms).toEqual(["chat:read", "chat:ask"]);
    expect(hasChatPermission(
      { operator_id: "guest", approver_id: "guest-not-authorized", mode: "prod" },
      "chat:approve"
    )).toBe(false);
  });

  it("returns 403 when prod non-approver tries wire flush", async () => {
    start();
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    const cookie = `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
    const res = await fetch(`${baseUrl}/chat/v1/wire/flush`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { permission?: string };
    expect(body.permission).toBe("chat:wire");
  });

  it("allows chat:read users to GET the L1-safe validate route", async () => {
    start();
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    const res = await fetch(`${baseUrl}/chat/v1/validate`, {
      headers: { Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      error_count: number;
      warning_count: number;
      issues: Array<{ path: string; message: string }>;
    };
    expect(typeof body.ok).toBe("boolean");
    expect(typeof body.error_count).toBe("number");
    expect(typeof body.warning_count).toBe("number");
    expect(body.issues.every((issue) => !issue.path.startsWith("/"))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/\b\d{7,}\b/);
  });
});
