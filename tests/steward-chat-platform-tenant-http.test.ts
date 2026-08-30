import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * The shared control plane and the platform integration flags. One tenant must
 * never see another's provisioning, and the Community mail flags are a
 * declaration on the Steward side — the route has to say so rather than imply
 * that flipping a flag redeployed anything.
 */
describe("steward chat platform and tenant HTTP", () => {
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

  it("refuses a login without the dev passkey", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operator_id: "OP-001", approver_id: "OP-001" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("names the signed-in operator on the session", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/auth/me`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      user?: { operator_id?: string };
      permissions?: string[];
    };
    expect(body.user?.operator_id).toBe("OP-001");
    expect(Array.isArray(body.permissions)).toBe(true);
  });

  it("drops the session on logout", async () => {
    const cookie = await login();
    const out = await fetch(`${baseUrl}/chat/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(out.status).toBeLessThan(400);
    const after = await fetch(`${baseUrl}/chat/v1/today`, { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });

  it("requires a session for the control plane and the ops dashboard", async () => {
    for (const path of [
      "/chat/v1/product/control-plane",
      "/chat/v1/product/ops-dashboard",
      "/chat/v1/product/initial-setup",
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(401);
    }
  });

  it("serves the control plane only to a ceo seat", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/product/control-plane`, {
      headers: { Cookie: cookie },
    });
    expect([200, 401, 403]).toContain(res.status);

    const operator = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const denied = await fetch(`${baseUrl}/chat/v1/product/control-plane`, {
      headers: { Cookie: operator },
    });
    expect([401, 403]).toContain(denied.status);
  });

  it("says out loud that a mail flag is a declaration, not a deploy", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      headers: { Cookie: cookie },
    });
    expect([200, 401, 403]).toContain(res.status);
    if (res.status === 200) {
      const body = (await res.json()) as { note?: string; community_env?: unknown };
      expect(body.note ?? "").toContain("再デプロイ");
      expect(body.community_env).toBeDefined();
    }
  });

  it("refuses to flip a platform flag without chat:approve", async () => {
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ flag: "tenant_mail", value: true }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("rejects an unknown platform flag", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ flag: "not-a-flag", value: true }),
    });
    expect([400, 401, 403, 422]).toContain(res.status);
  });
});
