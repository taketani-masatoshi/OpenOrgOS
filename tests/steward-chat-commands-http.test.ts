import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * The command router turns a sentence into a CLI plan. It is the HTTP surface
 * behind the grade A/B change gates, so what matters is that a plan is never
 * executed implicitly: a write must come back as a plan the human confirms,
 * and an expired or unknown plan id must not run anything.
 */
describe("steward chat command router HTTP", () => {
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

  function preview(cookie: string, message: string) {
    return fetch(`${baseUrl}/chat/v1/commands/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ message }),
    });
  }

  it("requires a session to list commands", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/commands`);
    expect(res.status).toBe(401);
  });

  it("lists a command catalog scoped to the session", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/commands`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands: Array<{ skill_id: string }> };
    expect(Array.isArray(body.commands)).toBe(true);
  });

  it("returns not_found rather than guessing for an unmatched sentence", async () => {
    const cookie = await login();
    const res = await preview(cookie, "この文はどのコマンドにも当たらないはずです");
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { plan: { status: string } };
    expect(["not_found", "ambiguous"]).toContain(body.plan.status);
  });

  it("never executes a write straight from a preview", async () => {
    const cookie = await login();
    const res = await preview(cookie, "今日の状況を教えて");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plan: { status: string; executed?: boolean };
    };
    expect(body.plan.executed ?? false).toBe(false);
    expect(body.plan.status).not.toBe("executed");
  });

  it("rejects a malformed preview body with 400", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/commands/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("refuses to run a plan id that does not exist", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/commands/PLAN-does-not-exist/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ confirmed: true }),
    });
    expect(res.status).toBe(404);
  });

  it("refuses command preview for an operator absent from the registry", async () => {
    const cookie = await login("OP-not-in-registry");
    // Dev sessions skip permission checks; only prod mode binds the registry.
    process.env.ORGOS_PROD = "1";
    const res = await preview(cookie, "今日の状況を教えて");
    expect([401, 403]).toContain(res.status);
  });
});
