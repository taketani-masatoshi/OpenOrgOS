import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Governance surfaces over HTTP: internal approvals (propose / approve /
 * reject), company events and their chain, and org chart change proposals.
 * The through-line is that nothing irreversible happens without a named human
 * decision, and self-approval is never allowed.
 */
describe("steward chat governance HTTP", () => {
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

  it("requires a session to list approvals", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/approvals`);
    expect(res.status).toBe(401);
  });

  it("refuses a proposal with no subject type", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/approvals/propose", cookie, { message: "x" });
    expect(res.status).toBe(422);
  });

  it("proposes an internal approval and lists it", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/approvals/propose", cookie, {
      subject_type: "expense",
      message: "governance HTTP test",
      amount: 12_000,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { approval: { approval_id: string; status: string } };
    expect(body.approval.approval_id).toBeTruthy();

    const list = await fetch(`${baseUrl}/chat/v1/approvals`, { headers: { Cookie: cookie } });
    expect(list.status).toBe(200);
  });

  it("refuses to approve an approval that does not exist", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/approvals/APR-does-not-exist/approve", cookie, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses to reject an approval that does not exist", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/approvals/APR-does-not-exist/reject", cookie, {
      reason: "no",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("reports a verifiable company event chain", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/events/chain/verify`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { ok?: boolean } };
    expect(body.report).toBeDefined();
  });

  it("rejects a malformed company event with 422", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/events", cookie, { kind: "", title: "" });
    expect([400, 422]).toContain(res.status);
  });

  it("requires approval_id on an org chart change proposal", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/org/chart/change/propose", cookie, { change: {} });
    expect(res.status).toBe(422);
  });

  it("requires change_id to validate or apply an org chart change", async () => {
    const cookie = await login();
    for (const path of [
      "/chat/v1/org/chart/change/validate",
      "/chat/v1/org/chart/change/apply",
    ]) {
      const res = await post(path, cookie, {});
      expect(res.status, path).toBe(422);
    }
  });

  it("serves the contract ledger only to a session", async () => {
    const anonymous = await fetch(`${baseUrl}/chat/v1/contracts/status`);
    expect(anonymous.status).toBe(401);

    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/contracts/status`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it("validates company identity setup before it touches the tenant", async () => {
    const anonymous = await fetch(`${baseUrl}/chat/v1/product/onboarding/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company_name: "Anonymous KK" }),
    });
    expect(anonymous.status).toBe(401);

    const cookie = await login();
    const rejected = await post("/chat/v1/product/onboarding/setup", cookie, {
      company_name: "",
      fiscal_year_end_month: 13,
    });
    expect(rejected.status, await rejected.clone().text()).toBe(422);
  });

  it("refuses company identity setup for a non-ceo operator", async () => {
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await post("/chat/v1/product/onboarding/setup", cookie, {
      company_name: "Not Allowed KK",
    });
    expect([401, 403]).toContain(res.status);
  });

  it("refuses company event writes for an operator without events:write", async () => {
    // OP-003 is an approver; events:write belongs to ceo / operator seats.
    const cookie = await login("OP-003");
    // Dev sessions skip permission checks; only prod mode binds the registry.
    process.env.ORGOS_PROD = "1";
    const res = await post("/chat/v1/events", cookie, {
      kind: "board_meeting",
      title: "unauthorized",
      occurred_at: "2026-08-01",
    });
    expect([401, 403]).toContain(res.status);
  });

  it("refuses approval decisions for an operator without chat:approve", async () => {
    // OP-002 is a plain operator: it may propose, never decide.
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await post("/chat/v1/approvals/APR-001/approve", cookie, {});
    expect([401, 403]).toContain(res.status);
  });
});
