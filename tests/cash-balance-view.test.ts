import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCashBalanceView,
  formatCashBalanceMarkdown,
} from "../src/lib/cash-balance-view.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("cash-balance CLI view", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("shows MAL confirmed total without account numbers", () => {
    const view = buildCashBalanceView();
    expect(view.missing).toBe(false);
    expect(view.status).toBe("confirmed");
    expect(view.total).toBe(10_000_000);
    expect(view.accounts.map((a) => a.bank_account_id).sort()).toEqual([
      "BANK-001",
      "BANK-002",
    ]);
    const md = formatCashBalanceMarkdown(view);
    expect(md).toContain("￥10,000,000");
    expect(md).toContain("BANK-001");
    expect(md).toContain("BANK-002");
    expect(md).toContain("finances cash-balance");
    expect(md).not.toMatch(/口座番号:\s*\d/);
  });
});
