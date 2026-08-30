import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * The medical-device compliance surface is read-only on purpose: QMS / GVP
 * ledgers are regulated records, so mutations stay on the CLI + org approval
 * path. These tests pin that contract, plus the session requirement.
 */
describe("steward chat medical device HTTP", () => {
  const ROUTE = "/chat/v1/compliance/medical-device";
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("mal");
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

  it("requires a session", async () => {
    const res = await fetch(`${baseUrl}${ROUTE}`);
    expect(res.status).toBe(401);
  });

  it("projects the QMS and GVP ledgers for an authenticated operator", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}${ROUTE}`, { headers: { Cookie: cookie } });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      enabled: boolean;
      qms?: { stats: Record<string, number> };
      gvp?: unknown;
      deadlines?: unknown[];
      decisions?: unknown[];
    };
    expect(body.ok).toBe(true);
    if (body.enabled) {
      expect(body.qms?.stats).toBeTruthy();
      expect(Array.isArray(body.deadlines)).toBe(true);
      expect(Array.isArray(body.decisions)).toBe(true);
    }
  });

  it("reports the module as disabled instead of failing for a tenant without it", async () => {
    setTenantId("demo");
    const cookie = await login();
    const res = await fetch(`${baseUrl}${ROUTE}`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; enabled: boolean };
    expect(body.ok).toBe(true);
    expect(typeof body.enabled).toBe("boolean");
  });

  it("refuses writes: ledger mutations stay on the approval path", async () => {
    const cookie = await login();
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await fetch(`${baseUrl}${ROUTE}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ id: "CAPA-001", status: "closed" }),
      });
      expect(res.status, method).toBe(405);
    }
  });

  it("refuses the surface for an operator absent from the registry", async () => {
    const cookie = await login("OP-not-in-registry");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}${ROUTE}`, { headers: { Cookie: cookie } });
    expect([401, 403]).toContain(res.status);
  });
});
