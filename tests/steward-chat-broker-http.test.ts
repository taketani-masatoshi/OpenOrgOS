import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBankAccountsYaml } from "../src/lib/utils.js";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * `/chat/v1/broker` moves money, so the HTTP surface is tested directly:
 * permission, account-number redaction, dry-run by default, and the tier B/C
 * approval gate on write.
 */
describe("steward chat broker HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  let bankBackup: string | undefined;

  beforeEach(async () => {
    setTenantId("demo");
    // bank-accounts.yaml is L2 and therefore absent from the repo; the transfer
    // path needs one, so the test owns a throwaway copy.
    const bankPath = getBankAccountsYaml();
    bankBackup = existsSync(bankPath) ? readFileSync(bankPath, "utf-8") : undefined;
    writeFileSync(bankPath, BANK_FIXTURE, "utf-8");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    // vitest.config disables step-up globally; this suite exists to prove the gate.
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
    const bankPath = getBankAccountsYaml();
    if (bankBackup === undefined) rmSync(bankPath, { force: true });
    else writeFileSync(bankPath, bankBackup, "utf-8");
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

  it("rejects transfer without a session", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/broker/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "BANK-001", amount: 1000, payee: "x", reference: "y" }),
    });
    expect(res.status).toBe(401);
  });

  it("never returns a full account number from /broker/accounts", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/broker/accounts`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accounts: Array<{ account_number_display: string }>;
    };
    for (const account of body.accounts) {
      expect(account.account_number_display).toMatch(/\*/);
      expect(account.account_number_display).not.toMatch(/^\d{7,}$/);
    }
    expect(JSON.stringify(body)).not.toMatch(/"account_number"/);
  });

  it("defaults to a dry run and does not write an instruction file", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/broker/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        from: firstAccountId(),
        amount: 1000,
        payee: "取引先",
        reference: "E2E",
      }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      instruction: { dry_run: boolean; from_number_redacted: string };
      path?: string;
    };
    expect(body.instruction.dry_run).toBe(true);
    expect(body.path).toBeUndefined();
    expect(body.instruction.from_number_redacted).toMatch(/\*/);
  });

  it("refuses a tier B/C write without an approved approval_id", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/broker/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        from: firstAccountId(),
        amount: 5_000_000,
        payee: "取引先",
        reference: "E2E",
        write: true,
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/approval_id/);
  });

  it("refuses transfer for an operator without broker:transfer", async () => {
    const cookie = await login("OP-002");
    // A dev session bypasses permission checks unless the server is in
    // production security mode, which is what the registry actually guards.
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/broker/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        from: firstAccountId(),
        amount: 1000,
        payee: "取引先",
        reference: "E2E",
      }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("rejects a malformed body with 422", async () => {
    const cookie = await login("OP-001");
    const res = await fetch(`${baseUrl}/chat/v1/broker/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ from: "", amount: -1, payee: "", reference: "" }),
    });
    expect(res.status).toBe(422);
  });
});

function firstAccountId(): string {
  return "BANK-001";
}

const BANK_FIXTURE = [
  "entity: Demo Corp",
  'as_of: "2026-08-01"',
  "status: active",
  "accounts:",
  "  - id: BANK-001",
  "    bank: テスト銀行",
  '    bank_code: "0009"',
  "    branch: テスト支店",
  '    branch_code: "001"',
  "    account_type: 普通",
  '    account_number: "1234567"',
  "    holder: Demo Corp",
  "    purpose: テスト用",
  "    ib_enabled: true",
  "    notes: null",
  "",
].join("\n");
