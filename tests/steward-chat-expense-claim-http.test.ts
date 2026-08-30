import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Expense claims end in a real reimbursement, so every mutation is guarded by
 * an optimistic revision and every state change must be refused when the claim
 * is unknown. This exercises the guards over HTTP rather than in-process.
 */
describe("steward chat expense claim HTTP", () => {
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
    return fetch(`${baseUrl}/chat/v1/org/budget${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  it("requires a session for the claim desk", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/org/budget/expense-claim/desk`);
    expect(res.status).toBe(401);
  });

  it("evaluates the spending gate before a claim exists", async () => {
    const cookie = await login();
    const res = await post("/expense-claim/gate", cookie, {
      person_id: "unknown-person",
      org_unit_id: "unknown-unit",
      account_code: "0000",
      amount_yen: 10_000,
    });
    // Either a gate verdict or a clear refusal — never a silent success.
    expect([200, 403, 422]).toContain(res.status);
    const body = (await res.json()) as { ok: boolean };
    if (res.status === 200) expect(typeof body.ok).toBe("boolean");
    else expect(body.ok).toBe(false);
  });

  it("refuses ingest without the expected claims revision", async () => {
    const cookie = await login();
    const res = await post("/expense-claim/ingest", cookie, {
      person_id: "P-001",
      amount_yen: 1_000,
    });
    expect(res.status).toBe(422);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "expected_claims_revision_required",
    });
  });

  it("refuses approval without the expected claim revision", async () => {
    const cookie = await login();
    const res = await post("/expense-claim/approve", cookie, { claim_id: "EXP-001" });
    expect(res.status).toBe(422);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "expected_claim_revision_required",
    });
  });

  it("refuses reimbursement of a claim that does not exist", async () => {
    const cookie = await login();
    const res = await post("/expense-claim/reimburse", cookie, {
      claim_id: "EXP-does-not-exist",
      expected_claim_revision: 1,
      payment_ref: "TX-1",
    });
    expect(res.status).toBe(422);
  });

  it("refuses to prepare a transfer for a claim that does not exist", async () => {
    const cookie = await login();
    const res = await post("/expense-claim/prepare-transfer", cookie, {
      claim_id: "EXP-does-not-exist",
      expected_claim_revision: 1,
      source_bank_account_id: "BANK-001",
      stakeholder_id: "STK-001",
      payee: "本人",
    });
    expect(res.status).toBe(422);
  });

  it("refuses the claim desk for an operator without expense:claim", async () => {
    const cookie = await login("OP-002");
    // Dev sessions skip permission checks; only prod mode binds the registry.
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/org/budget/expense-claim/desk`, {
      headers: { Cookie: cookie },
    });
    expect([401, 403]).toContain(res.status);
  });
});
