import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Money and irreversible acts, exercised against the same combined server the
 * console runs on. Transfers are dry-run only: nothing here may write a real
 * instruction file.
 */
const BANK_PATH = join(process.cwd(), "tenants/demo/data/finance/bank-accounts.yaml");
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

let bankBackup: string | undefined;

test.beforeAll(() => {
  // L2 file, so it is never committed; the spec owns a throwaway copy.
  bankBackup = existsSync(BANK_PATH) ? readFileSync(BANK_PATH, "utf-8") : undefined;
});

// Provisioning acts elsewhere in the suite re-init the demo tenant and take the
// finance folder with them, so the fixture is restored before every test rather
// than once.
test.beforeEach(() => {
  writeFileSync(BANK_PATH, BANK_FIXTURE, "utf-8");
});

test.afterAll(() => {
  if (bankBackup === undefined) rmSync(BANK_PATH, { force: true });
  else writeFileSync(BANK_PATH, bankBackup, "utf-8");
});

test.describe("steward chat money", () => {
  test("bank accounts are returned masked", async ({ page, request }) => {
    await loginConsole(page);
    await loginApi(request);

    const res = await request.get("/chat/v1/broker/accounts");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      accounts: Array<{ account_number_display: string }>;
    };
    expect(body.accounts.length).toBeGreaterThan(0);
    for (const account of body.accounts) {
      expect(account.account_number_display).toMatch(/\*/);
    }
    expect(JSON.stringify(body)).not.toContain("1234567");
  });

  test("transfer defaults to dry run and writes no file", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/broker/transfer", {
      data: { from: "BANK-001", amount: 1000, payee: "取引先", reference: "E2E" },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      instruction: { dry_run: boolean; from_number_redacted: string };
      path?: string;
    };
    expect(body.instruction.dry_run).toBe(true);
    expect(body.path).toBeFalsy();
    expect(body.instruction.from_number_redacted).toMatch(/\*/);
  });

  /**
   * The E2E server runs in dev mode, where permission checks are bypassed, so
   * per-role refusal is covered in tests/steward-chat-broker-http.test.ts. What
   * the running server must still prove is that no session gets nothing.
   */
  test("transfer without a session is refused", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const res = await anonymous.post("/chat/v1/broker/transfer", {
      data: { from: "BANK-001", amount: 1000, payee: "取引先", reference: "E2E" },
    });
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });
});
