import { afterEach, describe, expect, it } from "vitest";
import { journalEntrySchema, type JournalEntry } from "../schemas/finance/journal-entry.js";
import type { FixedAsset } from "../schemas/finance/types.js";
import { computeDecliningBalanceMonthly } from "../src/lib/finance/depreciation.js";
import {
  loadJournalEntries,
  saveJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { assessInvoiceRegistration } from "../src/lib/finance/invoice-qualified.js";
import {
  evaluateIndirectTaxClose,
  INDIRECT_TAX_ENGINE_UNINSTALLED,
  INDIRECT_TAX_NONE,
  JP_TAX_PROFILE_REQUIRED,
  type JpIndirectTaxEngine,
} from "../src/lib/finance/indirect-tax/port.js";
import { assertPlTaxCategories } from "../src/lib/finance/journal-post-guards.js";
import { evaluateTaxAdjustment } from "../src/lib/finance/tax-adjustment.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

const MONTH = "2026-09";

function throwingEngine(): JpIndirectTaxEngine {
  const fail = (): never => {
    throw new Error("jp consumption tax engine");
  };
  return {
    missingLineTaxCodes: fail,
    summarize: fail,
    profileBlocking: fail,
  };
}

function revenueWithoutTaxCategory(): JournalEntry {
  return journalEntrySchema.parse({
    entry_id: "JE-NO-TAX",
    occurred_at: `${MONTH}-12T00:00:00.000Z`,
    description: "missing category",
    claim_id: "ECL-20260912-001",
    event: "expense_claim_posted",
    evidence_refs: ["test:no-tax"],
    posted_at: `${MONTH}-12T00:00:00.000Z`,
    posted_by: "system",
    lines: [
      { account_code: "1100", debit_yen: 50, credit_yen: 0 },
      { account_code: "4100", debit_yen: 0, credit_yen: 50 },
    ],
  });
}

function migrateJournal(entry: JournalEntry): void {
  const prior = process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
  process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
  try {
    const file = loadJournalEntries();
    file.entries.push(entry);
    saveJournalEntries(file, { mode: "migration" });
  } finally {
    if (prior == null) delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    else process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = prior;
  }
}
function rateAsset(): FixedAsset {
  return {
    id: "ASSET-PORT",
    name: "desk",
    acquisition_cost: 1_000_000,
    book_value: 1_000_000,
    useful_life_years: 47,
    depreciation_method: "定率法",
  } as FixedAsset;
}

describe("indirect tax jurisdiction port", () => {
  afterEach(() => {
    resetFixtureJournalEntries();
    setTenantId("mal");
  });

  it("keeps a missing tax category as a Japan close error", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    expect(() => assertPlTaxCategories(revenueWithoutTaxCategory())).toThrow(
      /tax_category required/,
    );
    migrateJournal(revenueWithoutTaxCategory());
    const result = evaluateIndirectTaxClose(MONTH);
    expect(result.engine).toBe("jp");
    expect(result.pass).toBe(false);
    expect(result.detail).toContain("missing tax_category");
  });

  it("lists missing purchase invoice_status ids without inventing qualified status", () => {
    useFinanceFixtureTenant();
    resetFixtureJournalEntries();
    migrateJournal(
      journalEntrySchema.parse({
        entry_id: "JE-PURCHASE-NO-INV",
        occurred_at: `${MONTH}-15T00:00:00.000Z`,
        description: "purchase without invoice status",
        source: { kind: "manual", authorized_by: "OP-TEST" },
        evidence_refs: ["test:purchase"],
        posted_at: `${MONTH}-15T00:00:00.000Z`,
        posted_by: "OP-TEST",
        lines: [
          {
            account_code: "5100",
            debit_yen: 1100,
            credit_yen: 0,
            tax_category: "taxable_10",
          },
          {
            account_code: "1100",
            debit_yen: 0,
            credit_yen: 1100,
            tax_category: "out_of_scope",
          },
        ],
      }),
    );
    const result = evaluateIndirectTaxClose(MONTH);
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/仕入証跡不足/);
    expect(result.detail).toContain("JE-PURCHASE-NO-INV:line0:5100");
  });

  it("does not run the Japan engine for Hong Kong or the United States", () => {
    const engine = throwingEngine();
    setTenantId("hk-demo");
    expect(() => assertPlTaxCategories(revenueWithoutTaxCategory())).not.toThrow();
    const hongKong = evaluateIndirectTaxClose(MONTH, engine);
    expect(hongKong.pass).toBe(true);
    expect(hongKong.engine).toBe("uninstalled");
    expect(hongKong.detail).toBe(INDIRECT_TAX_NONE);

    setTenantId("us-demo");
    const unitedStates = evaluateIndirectTaxClose(MONTH, engine);
    expect(unitedStates.pass).toBe(true);
    expect(unitedStates.engine).toBe("uninstalled");
    expect(unitedStates.detail).toBe(INDIRECT_TAX_ENGINE_UNINSTALLED);
  });

  it("does not run Japanese consumption tax for Singapore GST", () => {
    setTenantId("sg-demo");
    const result = evaluateIndirectTaxClose(MONTH, throwingEngine());
    expect(result.pass).toBe(true);
    expect(result.engine).toBe("uninstalled");
    expect(result.detail).toBe(INDIRECT_TAX_ENGINE_UNINSTALLED);
  });

  it("refuses book-tax adjustments and invoice checks outside Japan", () => {
    setTenantId("us-demo");
    expect(() => evaluateTaxAdjustment("FY2026")).toThrow(JP_TAX_PROFILE_REQUIRED);
    setTenantId("hk-demo");
    expect(() => assessInvoiceRegistration()).toThrow(JP_TAX_PROFILE_REQUIRED);
  });

  it("does not apply the Japanese declining-balance table outside Japan", () => {
    useFinanceFixtureTenant();
    const japan = computeDecliningBalanceMonthly(rateAsset(), 1_000_000);
    setTenantId("us-demo");
    const unitedStates = computeDecliningBalanceMonthly(rateAsset(), 1_000_000);
    expect(japan).toBe(3583);
    expect(unitedStates).toBe(1773);
    expect(unitedStates).not.toBe(japan);
  });
});
