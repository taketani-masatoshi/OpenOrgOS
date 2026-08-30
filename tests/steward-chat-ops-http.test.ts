import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Day-to-day operation over HTTP: the Today context, the dispatch tower, the
 * LLM worker pool and the work-order run board. The shared risk is an LLM
 * turning a suggestion into an action, so every write here needs a confirmed
 * plan, and the worker pool must never hand back an API key.
 */
describe("steward chat ops HTTP", () => {
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

  it("requires a session for Today", async () => {
    for (const path of ["/chat/v1/today", "/chat/v1/today.md"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(401);
    }
  });

  it("serves Today as JSON and as markdown", async () => {
    const cookie = await login();
    const asJson = await fetch(`${baseUrl}/chat/v1/today`, { headers: { Cookie: cookie } });
    expect(asJson.status, await asJson.clone().text()).toBe(200);
    expect(asJson.headers.get("content-type")).toContain("application/json");

    const asMarkdown = await fetch(`${baseUrl}/chat/v1/today.md`, {
      headers: { Cookie: cookie },
    });
    expect(asMarkdown.status).toBe(200);
    expect(asMarkdown.headers.get("content-type")).toContain("text/markdown");
  });

  it("classifies work without assigning it", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tower/classify", cookie, {
      text: "請求書の発行が今月ぶんまだ",
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { ok: boolean; classification?: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.classification).toBeTruthy();
    // Classification alone must never produce work orders.
    expect(Object.keys(body.classification ?? {})).not.toContain("work_order_ids");
  });

  it("refuses to assign without an explicit confirmation", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tower/assign", cookie, {
      plan_id: "TOWER-does-not-exist",
      confirmed: false,
    });
    expect(res.status).toBe(400);
  });

  it("refuses to assign a plan that does not exist", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tower/assign", cookie, {
      plan_id: "TOWER-does-not-exist",
      confirmed: true,
    });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed classify body", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/tower/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{not json",
    });
    expect([400, 422]).toContain(res.status);
  });

  it("never returns an LLM worker API key, only its env var name", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/llm/workers`, { headers: { Cookie: cookie } });
    expect(res.status, await res.clone().text()).toBe(200);
    const raw = await res.text();
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(raw).not.toMatch(/"api_key"\s*:/);
  });

  it("refuses to rewrite the worker pool without llm:admin", async () => {
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/llm/workers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ workers: [] }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("requires a session for the run board", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/orchestration/runs`);
    expect(res.status).toBe(401);
  });

  it("refuses run board writes for an unknown work order", async () => {
    const cookie = await login();
    for (const path of [
      "/chat/v1/orchestration/runs/retry",
      "/chat/v1/orchestration/runs/cancel",
      "/chat/v1/orchestration/runs/complete",
      "/chat/v1/orchestration/runs/reopen",
    ]) {
      const res = await post(path, cookie, { id: "IMP-does-not-exist" });
      expect(res.status, path).toBeGreaterThanOrEqual(400);
    }
  });
});
