import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * QR receipts are the issuer's evidence and the counterparty's claim, so the
 * HTTP surface must prove: no session gets nothing, preview never persists,
 * an issued receipt carries a digest, and claim decisions need a real receipt.
 */
describe("steward chat receipt HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    // A qualified invoice needs the issuer's corporate number, which the demo
    // tenant deliberately lacks; aiac is a fully identified fixture tenant.
    setTenantId("aiac");
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

  const PREVIEW_BODY = {
    document_type: "qualified_invoice",
    transaction_date: "2026-08-01",
    recipient_name: "取引先株式会社",
    lines: [
      {
        description: "コンサルティング",
        tax_rate: 10,
        amount_excluding_tax: 100_000,
        tax_amount: 10_000,
        amount_including_tax: 110_000,
      },
    ],
  };

  it("requires a session to list receipts", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/receipts`);
    expect(res.status).toBe(401);
  });

  it("previews a receipt without persisting it", async () => {
    const cookie = await login();
    const before = await listReceiptIds(cookie);

    const res = await fetch(`${baseUrl}/chat/v1/receipts/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(PREVIEW_BODY),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      persisted: boolean;
      digest: string;
      total_amount: number;
      qr_link: string;
    };
    expect(body.persisted).toBe(false);
    expect(body.digest).toBeTruthy();
    expect(body.total_amount).toBe(110_000);
    expect(body.qr_link).toMatch(/^https?:\/\//);

    expect(await listReceiptIds(cookie)).toEqual(before);
  });

  it("refuses to issue for a tenant with no corporate number", async () => {
    setTenantId("demo");
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(PREVIEW_BODY),
    });
    expect(res.status).toBe(422);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: expect.stringMatching(/corporate_number/),
    });
  });

  it("rejects a receipt with no lines", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...PREVIEW_BODY, lines: [] }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects invalid JSON with 400", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown receipt", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/RCP-does-not-exist`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(404);
  });

  it("refuses to approve a claim that does not exist", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/approve-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ receipt_id: "RCP-does-not-exist" }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses to reject a claim without a reason", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/receipts/reject-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ receipt_id: "RCP-does-not-exist", reason: "" }),
    });
    expect(res.status).toBe(422);
  });

  it("refuses receipt issue for an operator without receipt:issue", async () => {
    const cookie = await login("OP-002");
    // Dev sessions skip permission checks; the registry only binds in prod mode.
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/receipts/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(PREVIEW_BODY),
    });
    expect([401, 403]).toContain(res.status);
  });

  async function listReceiptIds(cookie: string): Promise<string[]> {
    const res = await fetch(`${baseUrl}/chat/v1/receipts`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { receipts: Array<{ receipt_id: string }> };
    return body.receipts.map((r) => r.receipt_id);
  }
});
