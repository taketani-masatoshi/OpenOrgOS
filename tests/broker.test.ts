import { describe, it, expect, vi } from "vitest";
import type { BankAccountsFile } from "../schemas/classification.js";

const banksFixture: BankAccountsFile = {
  entity: "Test Org",
  as_of: "2026-07-11",
  status: "active",
  accounts: [
    {
      id: "BANK-001",
      bank: "テスト銀行",
      branch: "テスト支店",
      account_type: "普通",
      account_number: "1234567",
      holder: "Test Org",
    },
  ],
};

vi.mock("../src/lib/classification.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/classification.js")>();
  return {
    ...actual,
    loadBankAccounts: () => banksFixture,
    loadClassificationRegistry: () => ({}),
    checkAgentAccess: () => ({ allowed: true, reason: "test fixture" }),
  };
});

import {
  buildTransferInstruction,
  getBankAccountView,
  formatTransferMarkdown,
} from "../src/lib/broker.js";
import { loadBankAccounts } from "../src/lib/classification.js";

describe("broker", () => {
  it("loads bank accounts and masks numbers in redacted mode", () => {
    const banks = loadBankAccounts();
    expect(banks).toBeDefined();
    const view = getBankAccountView(banks!, "BANK-001", "redacted");
    expect(view?.bank).toBe("テスト銀行");
    expect(view?.account_number_display).toBe("***4567");
  });

  it("builds transfer instruction without full account number", () => {
    const instr = buildTransferInstruction({
      from: "BANK-001",
      amount: 100000,
      payee: "テスト取引先",
      reference: "TEST-001",
      dryRun: true,
    });
    expect(instr.amount_yen).toBe(100000);
    expect(instr.from_number_redacted).toMatch(/\*+/);
    const md = formatTransferMarkdown(instr);
    expect(md).not.toContain("1234567");
    expect(md).toContain("DRY-RUN");
  });
});
