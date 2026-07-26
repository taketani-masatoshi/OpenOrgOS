import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  createAgentOrder,
  missionsDir,
  submitAgentReport,
} from "../src/lib/agent-reporting.js";
import { getDataDir, getDocsReportsDir } from "../src/lib/utils.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat agent inbox api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  let operatorsBackup: string | null = null;
  let operatorsPath = "";

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "0";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_PROD = "0";
    process.env.NODE_ENV = "test";

    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

    operatorsPath = join(getDataDir(), "org", "operators.yaml");
    operatorsBackup = existsSync(operatorsPath) ? readFileSync(operatorsPath, "utf-8") : null;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    const dir = missionsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    if (operatorsBackup !== null) {
      writeFileSync(operatorsPath, operatorsBackup, "utf-8");
    }
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("GET /chat/v1/agent-inbox returns snapshot", async () => {
    const order = createAgentOrder({
      toAgent: "finance",
      subject: "API 受信箱テスト",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: "API 経由で見えるはず",
      autoForward: true,
    });

    await start();
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox?for=executive_steward`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      unread_count: number;
      items: Array<{ mission_id: string; subject: string; unread: boolean }>;
    };
    expect(body.ok).toBe(true);
    expect(body.unread_count).toBeGreaterThan(0);
    expect(body.items.some((i) => i.mission_id === order.id)).toBe(true);
  });

  it("GET summary rejects path traversal", async () => {
    await start();
    const res = await fetch(
      `${baseUrl}/chat/v1/agent-inbox/summary?path=${encodeURIComponent("../../package.json")}`
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/\.\.|must/i);
  });

  it("GET summary returns markdown for allowed path", async () => {
    const summaries = join(getDocsReportsDir(), "agent-summaries", "finance");
    mkdirSync(summaries, { recursive: true });
    const file = join(summaries, "2099-02-02-api-test.md");
    writeFileSync(file, "# API summary fixture\n\nhello\n", "utf-8");

    await start();
    const res = await fetch(
      `${baseUrl}/chat/v1/agent-inbox/summary?path=${encodeURIComponent(
        "docs/reports/agent-summaries/finance/2099-02-02-api-test.md"
      )}`
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; markdown: string };
    expect(body.ok).toBe(true);
    expect(body.markdown).toContain("API summary fixture");

    rmSync(file, { force: true });
  });

  it("POST ack marks item read when auth is off (dev-bypass)", async () => {
    const order = createAgentOrder({
      toAgent: "operations",
      subject: "ack via API",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "operations",
      missionId: order.id,
      summary: "ack me",
      autoForward: true,
    });

    await start();
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission_id: order.id, notes: "確認" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      item: { mission_id: string; unread: boolean; relay_steward: string };
    };
    expect(body.ok).toBe(true);
    expect(body.item.unread).toBe(false);
    expect(body.item.relay_steward).toBe("ack");
  });

  it("returns 403 when readonly operator tries ack", async () => {
    process.env.STEWARD_CHAT_AUTH = "1";
    // Append a readonly operator for this test only (restored in afterEach).
    const yaml = operatorsBackup ?? "version: \"1\"\noperators: []\n";
    writeFileSync(
      operatorsPath,
      `${yaml.trimEnd()}
  - operator_id: OP-READONLY
    display_name: Readonly Viewer
    role: readonly
    status: active
`,
      "utf-8"
    );

    const order = createAgentOrder({
      toAgent: "finance",
      subject: "readonly ack deny",
      fromActor: "executive_steward",
    });
    submitAgentReport({
      agentId: "finance",
      missionId: order.id,
      summary: "should not ack",
      autoForward: true,
    });

    await start();
    const { token } = registerSession({
      operator_id: "OP-READONLY",
      approver_id: "Readonly Viewer",
      mode: "prod",
    });
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox/ack`, {
      method: "POST",
      headers: {
        Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mission_id: order.id }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { permission?: string };
    expect(body.permission).toBe("chat:ask");
  });
});
