import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { getDataDir } from "../src/lib/utils.js";

describe("steward chat agent inbox delegate", () => {
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
    operatorsPath = join(getDataDir(), "org", "operators.yaml");
    operatorsBackup = existsSync(operatorsPath) ? readFileSync(operatorsPath, "utf-8") : null;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    if (operatorsBackup !== null) {
      writeFileSync(operatorsPath, operatorsBackup, "utf-8");
    }
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("rejects delegate without confirmed:true", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox/delegate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: "テスト委譲",
        requirements: "finance path check",
        path: "data/finance/",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("creates work orders when confirmed", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox/delegate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmed: true,
        subject: "Web delegate API test",
        requirements: "チャット委譲 API の実装確認",
        path: "src/lib/steward-chat/",
        priority: "P2",
        from: "executive_steward",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      work_order_ids: string[];
      agents: string[];
      error?: string;
      snapshot?: { pending_orders: Array<{ work_order_id?: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.work_order_ids.length).toBeGreaterThan(0);
    expect(body.agents.length).toBeGreaterThan(0);
    expect(
      body.snapshot?.pending_orders.some((p) =>
        body.work_order_ids.includes(p.work_order_id ?? "")
      )
    ).toBe(true);
  });

  it("returns 403 for readonly operator on delegate", async () => {
    process.env.STEWARD_CHAT_AUTH = "1";
    const yaml = operatorsBackup ?? 'version: "1"\noperators: []\n';
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

    await start();
    const { token } = registerSession({
      operator_id: "OP-READONLY",
      approver_id: "Readonly Viewer",
      mode: "prod",
    });
    const res = await fetch(`${baseUrl}/chat/v1/agent-inbox/delegate`, {
      method: "POST",
      headers: {
        Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmed: true,
        subject: "should fail",
        requirements: "no permission",
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { permission?: string };
    expect(body.permission).toBe("chat:ask");
  });
});
