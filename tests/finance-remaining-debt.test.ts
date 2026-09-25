import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import * as jurisdiction from "../src/lib/jurisdiction.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { computeDecliningBalanceMonthly } from "../src/lib/finance/depreciation.js";
import { resolveIndirectTaxCapability } from "../src/lib/finance/indirect-tax/capability.js";
import { evaluateIndirectTaxClose } from "../src/lib/finance/indirect-tax/port.js";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";
import { computeAnnualSalaryIncomeDeduction } from "../src/lib/finance/payroll-yea-settlement.js";

describe("remaining finance debt increments", () => {
  afterEach(() => vi.restoreAllMocks());

  it("applies common-use and transitional rates only with period evidence", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    const dir = join(getDataDir(), "finance", "consumption-tax-period-evidence");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "2026-09.yaml"),
      YAML.stringify({
        version: 1,
        period: "2026-09",
        taxable_sales_ratio_pct: 50,
        transitional: {
          eligible: true,
          rate_pct: 80,
          evidence_refs: ["test:transitional"],
        },
      })
    );
    appendJournalEntry({
      entry_id: "JE-COMMON",
      occurred_at: "2026-09-10T00:00:00.000Z",
      description: "common",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["synthetic"],
      lines: [
        {
          account_code: "5900",
          debit_yen: 11000,
          credit_yen: 0,
          tax_category: "taxable_10",
          purchase_use: "common",
          invoice_status: "qualified",
          tax_amount_yen: 1000,
        },
        { account_code: "1100", debit_yen: 0, credit_yen: 11000, tax_category: "out_of_scope" },
      ],
    });
    appendJournalEntry({
      entry_id: "JE-TRANS",
      occurred_at: "2026-09-11T00:00:00.000Z",
      description: "transitional",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["synthetic"],
      lines: [
        {
          account_code: "5900",
          debit_yen: 11000,
          credit_yen: 0,
          tax_category: "taxable_10",
          purchase_use: "taxable_only",
          invoice_status: "nonqualified_80",
          tax_amount_yen: 1000,
        },
        { account_code: "1100", debit_yen: 0, credit_yen: 11000, tax_category: "out_of_scope" },
      ],
    });    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.input_tax_yen).toBe(500 + 800);
    expect(loadJournalEntries().entries.length).toBeGreaterThan(0);
  });

  it("computes declining-balance monthly when fiscal opening is verified", () => {
    useFinanceFixtureTenant();
    const monthly = computeDecliningBalanceMonthly(
      {
        id: "ASSET-100",
        acquisition_cost: 1_000_000,
        book_value: 1_000_000,
        useful_life_years: 5,
        fiscal_opening_book_value_yen: 1_000_000,
        guarantee_amount_yen: 108_000,
        depreciation_method: "定率法",
      } as never,
      1_000_000
    );
    expect(monthly).toBe(Math.floor(Math.floor((1_000_000 * 40) / 100) / 12));
  });

  it("exposes foreign capability without filing", () => {
    const base = jurisdiction.getResolvedJurisdiction();
    vi.spyOn(jurisdiction, "getResolvedJurisdiction").mockReturnValue({
      ...base,
      code: "EE",
      pack: { ...base.pack, tax_profile_schema: "corporate", indirect_tax_family: "vat_credit" },
    });
    const capability = resolveIndirectTaxCapability();
    expect(capability).toMatchObject({ engine: "ee_vat", installed: false, filing: false });
    expect(evaluateIndirectTaxClose("2026-09").engine).toBe("ee_vat");
    expect(evaluateIndirectTaxClose("2026-09").pass).toBe(false);
  });

  it("uses the annual salary income deduction table", () => {
    expect(computeAnnualSalaryIncomeDeduction(1_500_000)).toBe(550_000);
    expect(computeAnnualSalaryIncomeDeduction(3_000_000)).toBe(980_000);
  });
});
