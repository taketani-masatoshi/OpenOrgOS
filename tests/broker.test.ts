import { describe, it, expect } from "vitest";
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
    expect(view?.bank).toContain("三井住友");
    expect(view?.account_number_display).not.toBe("REPLACE_ME");
  });

  it("builds transfer instruction without full account number", () => {
    const instr = buildTransferInstruction({
      from: "BANK-001",
      amount: 100000,
      payee: "株式会社サウスウッド",
      reference: "CTR-003 賃料",
      stakeholderId: "STK-003",
      dryRun: true,
    });
    expect(instr.amount_yen).toBe(100000);
    expect(instr.from_number_redacted).toMatch(/\*+/);
    const md = formatTransferMarkdown(instr);
    expect(md).not.toContain("REPLACE_ME");
    expect(md).toContain("DRY-RUN");
  });
});
