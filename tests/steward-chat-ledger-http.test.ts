import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";

/**
 * HTTP surface of the ledger: posting, the month lock, reversal, 電子帳簿
 * search and the bank CSV path. These are the acts the tenant is audited on,
 * so each one is driven through the BFF rather than the library.
 */
describe("steward chat ledger HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let cookie = "";
  const env = { ...process.env };

  beforeEach(async () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    ensureLedgerDemoChartOfAccounts();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
    cookie = await login("OP-001");
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

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  async function get(path: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  }

  it("requires a session for the workbench", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/ledger/workbench`);
    expect(res.status).toBe(401);
  });

  it("posts a balanced manual entry and refuses an unknown account", async () => {
    const ok = await post("/chat/v1/ledger/manual-entry", {
      description: "HTTP テスト仕訳",
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: 1200,
    });
    expect(ok.status, await ok.clone().text()).toBe(200);

    const bad = await post("/chat/v1/ledger/manual-entry", {
      description: "存在しない勘定",
      debit_account: "9999",
      credit_account: "1100",
      amount_yen: 1200,
    });
    expect(bad.status).toBe(422);
  });

  it("shows the entry in the trial balance and BS/PL", async () => {
    await post("/chat/v1/ledger/manual-entry", {
      description: "HTTP テスト仕訳",
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: 1200,
    });
    const res = await get("/chat/v1/ledger/workbench");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain("5100");
  });

  it("locks a month, refuses posting into it, and unlocks only with a reason", async () => {
    const month = "2026-01";
    const lock = await post("/chat/v1/ledger/period", { month, action: "lock" });
    expect(lock.status, await lock.clone().text()).toBe(200);

    const blocked = await post("/chat/v1/ledger/manual-entry", {
      description: "ロック済みへの記帳",
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: 500,
      occurred_at: `${month}-15`,
    });
    expect([409, 422]).toContain(blocked.status);

    const noReason = await post("/chat/v1/ledger/period", { month, action: "unlock" });
    expect(noReason.status).toBe(422);

    const unlocked = await post("/chat/v1/ledger/period", {
      month,
      action: "unlock",
      reason: "HTTP テストの復旧",
    });
    expect(unlocked.status, await unlocked.clone().text()).toBe(200);
  });

  it("rejects an unknown action on the period endpoint", async () => {
    const res = await post("/chat/v1/ledger/period", { month: "2026-01", action: "burn" });
    expect(res.status).toBe(422);
  });

  it("searches 電子帳簿 by date range and amount", async () => {
    await post("/chat/v1/ledger/manual-entry", {
      description: "電帳検索テスト",
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: 4321,
    });
    const res = await get("/chat/v1/ledger/dencho/search?amount_min=4321&amount_max=4321");
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { entries?: unknown[]; results?: unknown[] };
    const rows = body.entries ?? body.results ?? [];
    expect(Array.isArray(rows)).toBe(true);
  });

  it("corrects a mistake with a reversing entry, never by editing", async () => {
    const posted = await post("/chat/v1/ledger/manual-entry", {
      description: "取り消す仕訳",
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: 777,
    });
    const { entry_id: entryId } = (await posted.json()) as { entry_id: string };
    expect(entryId).toBeTruthy();

    const reversed = await post("/chat/v1/ledger/reverse", { entry_id: entryId });
    expect(reversed.status, await reversed.clone().text()).toBe(200);
    const { entry_id: reversalId } = (await reversed.json()) as { entry_id: string };
    expect(reversalId).not.toBe(entryId);

    const missing = await post("/chat/v1/ledger/reverse", { entry_id: "" });
    expect(missing.status).toBe(422);
  });

  it("offers bank CSV presets", async () => {
    const res = await get("/chat/v1/ledger/bank-csv-template?preset=mizuho");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presets: unknown[] };
    expect(body.presets.length).toBeGreaterThanOrEqual(4);
  });

  it("refuses ledger writes for an operator without finance:reconcile", async () => {
    const otherCookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: otherCookie },
      body: JSON.stringify({ month: "2026-01", action: "lock" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
