import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Sales pipeline and the hospitality stay ledger over HTTP. Winning a deal and
 * reopening one are decisions, not edits, so they sit behind `chat:approve`
 * while ordinary stage moves need only `chat:ask`.
 */
describe("steward chat sales and stays HTTP", () => {
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

  function post(path: string, cookie: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  it("requires a session for every customer surface", async () => {
    for (const path of [
      "/chat/v1/customers/nav",
      "/chat/v1/customers/pipeline",
      "/chat/v1/customers/accounts",
      "/chat/v1/customers/inbound",
      "/chat/v1/customers/churn",
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(401);
    }
  });

  it("serves the pipeline and the module gate beside it", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/customers/pipeline`, {
      headers: { Cookie: cookie },
    });
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as { ok: boolean; gate?: unknown };
      expect(body.ok).toBe(true);
      // The gate travels with the payload so the UI never guesses whether the
      // sales module is on.
      expect(body.gate).toBeTruthy();
    }
  });

  it("refuses a stage move for a deal that does not exist", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/customers/deals/set-stage", cookie, {
      deal_id: "DEAL-does-not-exist",
      stage: "qualified",
    });
    expect([403, 422]).toContain(res.status);
  });

  it("refuses to promote an inquiry that does not exist", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/customers/inquiry/promote", cookie, {
      inquiry_id: "INQ-does-not-exist",
    });
    expect([403, 422]).toContain(res.status);
  });

  it("rejects a non-GET on a read-only customer surface", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/customers/churn", cookie, {});
    expect([403, 405]).toContain(res.status);
  });

  it("reports the stay ledger and whether the module is on", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/hospitality/ops-due?today=2026-08-01`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      module_enabled: boolean;
      stay_count: number;
      due: unknown[];
    };
    expect(body.ok).toBe(true);
    expect(typeof body.module_enabled).toBe("boolean");
    // A disabled module reports zero rather than pretending to have a ledger.
    if (!body.module_enabled) {
      expect(body.stay_count).toBe(0);
      expect(body.due).toEqual([]);
    }
  });

  it("requires a session for the stay ledger", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/hospitality/ops-due`);
    expect(res.status).toBe(401);
  });

  it("refuses sales writes for an operator without the sales panel", async () => {
    const cookie = await login("OP-not-in-registry");
    process.env.ORGOS_PROD = "1";
    const res = await post("/chat/v1/customers/deals/set-stage", cookie, {
      deal_id: "DEAL-001",
      stage: "won",
    });
    expect([401, 403]).toContain(res.status);
  });
});
