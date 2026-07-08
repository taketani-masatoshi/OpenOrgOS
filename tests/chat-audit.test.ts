import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getWorkspaceRoot } from "../src/lib/orgos-paths.js";
import { appendChatAudit } from "../src/lib/steward-chat/audit.js";

describe("chat audit", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let testPort = 19491;
  let auditPath = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    auditPath = join(getWorkspaceRoot(), "data", ".orgos", "chat-audit-test.jsonl");
    process.env.ORGOS_CHAT_AUDIT_LOG = auditPath;
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });
    testPort += 1;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });
  });

  function start() {
    handle = startStewardChatServer({ host: "127.0.0.1", port: testPort });
    baseUrl = handle.url;
  }

  it("appends audit log entries", () => {
    mkdirSync(dirname(auditPath), { recursive: true });
    appendChatAudit({
      action: "message",
      operator_id: "test-op",
      approver_id: "CEO",
      ok: true,
      detail: "hello",
    });
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as { action: string; ok: boolean };
    expect(parsed.action).toBe("message");
    expect(parsed.ok).toBe(true);
  });

  it("records login via chat API", async () => {
    start();
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n");
    const login = JSON.parse(lines[lines.length - 1]!) as { action: string; ok: boolean };
    expect(login.action).toBe("login");
    expect(login.ok).toBe(true);
  });
});
