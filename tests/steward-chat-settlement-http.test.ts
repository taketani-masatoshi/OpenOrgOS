import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * `/chat/v1/settlement/*` is the second key: it turns an iPhone PassKey
 * assertion into an approval. The challenge routes are session-guarded, the
 * public routes are token-guarded, and completion must not accept an
 * unverified assertion.
 */
describe("steward chat settlement step-up HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
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

  async function login(operatorId: string): Promise<string> {
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

  it("refuses to open a challenge without a session", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/settlement/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: "APR-001" }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses to open a challenge for a session that cannot approve", async () => {
    // Opening the ceremony is the first half of an approval, so a session
    // alone must not be enough.
    // OP-002 is a plain operator: it can propose, but not approve.
    process.env.ORGOS_PROD = "1";
    const cookie = await login("OP-002");
    const res = await fetch(`${baseUrl}/chat/v1/settlement/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ approval_id: "APR-001" }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("requires approval_id", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/settlement/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for an unknown approval", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/settlement/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ approval_id: "APR-does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  it("never serves a challenge without its one-time token", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/settlement/challenge/CH-001`);
    expect(res.status).toBe(422);
    const withBadToken = await fetch(
      `${baseUrl}/chat/v1/settlement/challenge/CH-001?token=guess`,
    );
    expect(withBadToken.status).toBe(400);
  });

  it("rejects completion with an unknown challenge", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/settlement/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge_id: "CH-nope",
        token: "guess",
        credential_id: "cred",
        challenge: "chal",
        client_data_json: "{}",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects completion missing assertion fields with 422", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/settlement/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge_id: "CH-001" }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses settlement enrolment without a session", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/settlement/enroll/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});
