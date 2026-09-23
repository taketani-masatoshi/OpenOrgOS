if (process.env.ORGOS_TEST_DISPOSABLE_ROOT !== process.cwd())
  throw new Error("Use python3 scripts/run-finance-audit.py for disposable audit tests");
// Regression cases for the 2026-09-22 accounting audit; synthetic fixtures only.
import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { reverseJournalEntry } from "../src/lib/finance/journal-reverse.js";
import { buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { calculateSolePropIncomeTaxAmounts } from "../src/lib/finance/income-tax-policy.js";
import {
  computeAssetMonthlyDepreciation,
  postDepreciationJournalEntries,
} from "../src/lib/finance/depreciation.js";
import { postAnnualPlTransfer } from "../src/lib/finance/annual-close.js";
import { buildTrialBalance } from "../src/lib/finance/ledger/trial-balance.js";
import { evaluateTaxAdjustment } from "../src/lib/finance/tax-adjustment.js";
import { buildElectronicLedgerComplianceReport } from "../src/lib/finance/ledger/electronic-ledger.js";
import {
  saveOpeningBalances,
  loadOpeningBalances,
} from "../src/lib/finance/ledger/opening-balance.js";
import { lockMonth } from "../src/lib/finance/period-lock.js";
import { postSalesInvoiceJournalEntry } from "../src/lib/finance/journal-sources.js";
import {
  computePayrollMonth,
  computeWithholding,
  computeSalaryIncomeDeduction,
  type PayrollRates,
} from "../src/lib/finance/payroll-jp.js";
import { getDataDir, ROOT_DIR } from "../src/lib/utils.js";
import {
  resetFixtureJournalEntries,
  applyFixtureStatementRoles,
} from "./helpers/finance-fixture.js";
const dir = () => join(getDataDir(), "finance");
const entry = (id: string, lines: unknown[]) => ({
  entry_id: id,
  occurred_at: "2026-09-15T00:00:00.000Z",
  description: "Synthetic audit",
  source: { kind: "manual", authorized_by: "OP-AUDIT" },
  evidence_refs: ["synthetic:audit"],
  lines,
});
const line = (code: string, debit: number, credit: number, extra = {}) => ({
  account_code: code,
  debit_yen: debit,
  credit_yen: credit,
  tax_category: "out_of_scope",
  ...extra,
});
function post(id: string, lines: unknown[]) {
  return appendJournalEntry(entry(id, lines) as never);
}

describe("accounting audit regressions", () => {
  it("C1: nets sales and reversals", () => {
    resetFixtureJournalEntries();
    post("JE-SALE", [
      line("1100", 10000, 0),
      line("4100", 0, 10000, { tax_category: "taxable_10" }),
    ]);
    appendJournalEntry(
      reverseJournalEntry({
        entryId: "JE-SALE",
        occurredAt: "2026-09-16T00:00:00.000Z",
        authorizedBy: "OP-AUDIT",
      })
    );
    const tax = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(tax.output_tax_yen).toBe(0);
  });
  it("C2: rejects corrupted tax input", () => {
    resetFixtureJournalEntries();
    writeFileSync(join(dir(), "journal-entries.yaml"), "entries: [broken");
    expect(() => buildConsumptionTaxSummary({ period: "2026-09" })).toThrow();
  });
  it("C3: includes qualified fixed asset input tax", () => {
    resetFixtureJournalEntries();
    post("JE-ASSET", [
      line("1200", 100000, 0, {
        tax_category: "taxable_10",
        invoice_status: "qualified",
        purchase_use: "taxable_only",
        tax_amount_yen: 10000,
      }),
      line("2170", 10000, 0),
      line("1100", 0, 110000),
    ]);
    const tax = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(tax.input_tax_yen).toBe(10000);
  });
  it("C4: excludes non-taxable-only purchases", () => {
    resetFixtureJournalEntries();
    post("JE-COST", [
      line("5900", 10000, 0, {
        tax_category: "taxable_10",
        invoice_status: "nonqualified_80",
        purchase_use: "non_taxable_only",
        tax_amount_yen: 1000,
      }),
      line("1100", 0, 10000),
    ]);
    const tax = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(tax.input_tax_yen).toBe(0);
  });
  it("I1: rounds only the final payable", () => {
    const result = calculateSolePropIncomeTaxAmounts({
      businessIncomeAfterBlueYen: 149000,
      otherIncomeYen: 0,
      deductionsYen: 0,
      creditsYen: 0,
      withholdingYen: 0,
      prepaymentYen: 0,
    });
    expect(result).toMatchObject({ ok: true, payable_yen: 7600 });
  });
  it("D1: stops depreciation at residual value", () => {
    const asset = {
      id: "ASSET-999",
      name: "Synthetic",
      acquisition_cost: 1200000,
      book_value: 1,
      useful_life_years: 1,
      placed_in_service_month: "2020-01",
      depreciation_method: "定額法",
    };
    const amount = computeAssetMonthlyDepreciation(asset as never, "2026-09");
    expect(amount).toBe(0);
  });
  it("A1: clears abnormal revenue balances", () => {
    resetFixtureJournalEntries();
    post("JE-RETURN", [line("4100", 100, 0), line("1100", 0, 100)]);
    postAnnualPlTransfer({ fiscalYear: "FY2026", asOf: "2026-09-30" });
    const after = buildTrialBalance({ asOf: "2026-09-30" }).rows.find(
      (r) => r.account_code === "4100"
    )?.balance_yen;
    expect(Math.abs(after!)).toBe(0);
  });
  it("B1: posts invoice with counterparty", () => {
    resetFixtureJournalEntries();
    let error = "";
    try {
      postSalesInvoiceJournalEntry({
        invoiceId: "AUDIT-2026-09",
        counterpartyId: "CUST-AUDIT",
        amountYen: 10000,
        occurredAt: "2026-09-15T00:00:00Z",
        authorizedBy: "OP-AUDIT",
      });
    } catch (e) {
      error = String(e);
    }
    expect(error).toBe("");
    expect(loadJournalEntries().entries[0]?.lines[0]?.counterparty_id).toBe("CUST-AUDIT");
  });
  it("E1: does not certify unverified immutability", () => {
    resetFixtureJournalEntries();
    post("JE-OLD", [line("1100", 100, 0), line("4100", 0, 100)]);
    const file = loadJournalEntries();
    file.entries[0]!.lines[0]!.debit_yen = 900;
    file.entries[0]!.lines[1]!.credit_yen = 900;
    writeFileSync(join(dir(), "journal-entries.yaml"), YAML.stringify(file));
    const report = buildElectronicLedgerComplianceReport();
    expect(report.append_only_ok).toBe(false);
    expect(report.verification_status).toBe("unverified");
    expect(report.verification_gaps.length).toBeGreaterThan(0);
  });
  it("O1: protects opening after close", () => {
    resetFixtureJournalEntries();
    lockMonth({ month: "2026-09", lockedBy: "OP-AUDIT" });
    const opening = loadOpeningBalances()!;
    const before = buildTrialBalance({ asOf: "2026-09-30" }).rows.find(
      (r) => r.account_code === "1100"
    )?.balance_yen;
    opening.lines = [
      { account_code: "1100", debit_yen: 777, credit_yen: 0 },
      { account_code: "3100", debit_yen: 0, credit_yen: 777 },
    ];
    expect(() => saveOpeningBalances(opening)).toThrow("Opening balances cannot");
    const after = buildTrialBalance({ asOf: "2026-09-30" }).rows.find(
      (r) => r.account_code === "1100"
    )?.balance_yen;
    expect(after).toBe(before);
  });
  it("T1: applies high-income SME rate", () => {
    resetFixtureJournalEntries();
    applyFixtureStatementRoles();
    const path = join(dir(), "tax-profile.yaml");
    const profile = YAML.parse(readFileSync(path, "utf8"));
    profile.corporate_tax = {
      ...profile.corporate_tax,
      capital_stock: 1000000,
      category: "中小法人",
    };
    writeFileSync(path, YAML.stringify(profile));
    post("JE-BIG-SALE", [line("1100", 1100000000, 0), line("4100", 0, 1100000000)]);
    const sheet = evaluateTaxAdjustment("FY2026");
    expect(sheet.can_compute).toBe(true);
    expect(sheet.corporate_tax_yen).toBe(254704000);
  });
  it("P1: rejects implicit example payroll rates", () => {
    expect(() => computePayrollMonth({ month: "2026-09", grossYen: 1000000 })).toThrow(
      "Payroll rates file not found"
    );
  });
  it("P2: matches official 2026 withholding", () => {
    const social = 41300;
    const result = computeWithholding({
      grossYen: 280000,
      socialEmployeeYen: social,
      dependents: 0,
    });
    const a = 280000 - social,
      deduction = Math.ceil(a * 0.3 + 6667),
      base = 48334;
    const expected = Math.round(((a - deduction - base) * 0.05105) / 10) * 10;
    expect(expected).toBe(5720);
    expect(result.withholdingYen).toBe(5720);
  });

  it.each(["common", undefined])("C4: rejects incomplete purchase use %s", (use) => {
    resetFixtureJournalEntries();
    post("JE-INCOMPLETE", [
      line("5900", 1000, 0, {
        tax_category: "taxable_10",
        purchase_use: use,
        invoice_status: "qualified",
        tax_amount_yen: 100,
      }),
      line("1100", 0, 1000),
    ]);
    expect(() => buildConsumptionTaxSummary({ period: "2026-09" })).toThrow("evidence incomplete");
  });
  it("C4: refuses legacy transitional labels without eligibility evidence", () => {
    resetFixtureJournalEntries();
    post("JE-TRANSITION", [
      line("5900", 1000, 0, {
        tax_category: "taxable_10",
        purchase_use: "taxable_only",
        invoice_status: "nonqualified_80",
        tax_amount_yen: 100,
      }),
      line("1100", 0, 1000),
    ]);
    expect(() => buildConsumptionTaxSummary({ period: "2026-09" })).toThrow("evidence incomplete");
  });
  it("C1: carries a reduced-rate return in the later month as negative tax", () => {
    resetFixtureJournalEntries();
    post("JE-REDUCED", [
      line("1100", 10000, 0),
      line("4100", 0, 10000, { tax_category: "taxable_8" }),
    ]);
    appendJournalEntry(
      reverseJournalEntry({
        entryId: "JE-REDUCED",
        occurredAt: "2026-10-01T00:00:00.000Z",
        authorizedBy: "OP-AUDIT",
      })
    );
    expect(buildConsumptionTaxSummary({ period: "2026-09" }).output_tax_yen).toBe(800);
    expect(buildConsumptionTaxSummary({ period: "2026-10" }).output_tax_yen).toBe(-800);
  });
  it("C3: reverses the stored input tax, preserving invoice rounding", () => {
    resetFixtureJournalEntries();
    post("JE-INPUT", [
      line("5900", 109, 0, {
        tax_category: "taxable_10",
        invoice_status: "qualified",
        purchase_use: "taxable_only",
        tax_amount_yen: 11,
      }),
      line("1100", 0, 109),
    ]);
    expect(buildConsumptionTaxSummary({ period: "2026-09" }).input_tax_yen).toBe(11);
    appendJournalEntry(
      reverseJournalEntry({
        entryId: "JE-INPUT",
        occurredAt: "2026-10-01T00:00:00.000Z",
        authorizedBy: "OP-AUDIT",
      })
    );
    expect(buildConsumptionTaxSummary({ period: "2026-10" }).input_tax_yen).toBe(-11);
  });
  it("C2: only a complete explicit manual calculation bypasses the GL", () => {
    writeFileSync(join(dir(), "journal-entries.yaml"), "entries: [broken");
    expect(() =>
      buildConsumptionTaxSummary({ period: "2026-09", manual: { taxable_sales_10_yen: 1000 } })
    ).toThrow("all six");
    expect(
      buildConsumptionTaxSummary({
        period: "2026-09",
        manual: {
          taxable_sales_10_yen: 1000,
          taxable_sales_8_yen: 0,
          exempt_sales_yen: 0,
          tax_free_sales_yen: 0,
          taxable_purchases_10_yen: 0,
          taxable_purchases_8_yen: 0,
        },
      }).net_tax_yen
    ).toBe(100);
  });
  it.each([
    [158333, 54167],
    [158334, 54168],
    [299999, 96667],
    [300000, 96667],
    [549999, 146667],
    [550000, 146667],
    [708330, 162500],
    [708331, 162500],
  ])("P2: official salary deduction boundary %i", (a, expected) => {
    expect(computeSalaryIncomeDeduction(a)).toBe(expected);
  });
  it("P2: refuses unsupported years and invalid withholding inputs", () => {
    expect(() =>
      computeWithholding({ grossYen: 280000, socialEmployeeYen: 41300, fiscalYear: "FY2027" })
    ).toThrow("Unsupported");
    expect(() =>
      computeWithholding({ grossYen: 280000, socialEmployeeYen: 41300, dependents: 0.5 })
    ).toThrow("Invalid");
  });
  it("P1: uses separate confirmed health and pension assessments and rate dates", () => {
    const rates = YAML.parse(
      readFileSync(
        join(
          ROOT_DIR,
          "steward/jurisdiction-packs/JP/modules/jp_payroll/seed/payroll-rates-2026.yaml.example"
        ),
        "utf8"
      )
    ) as PayrollRates;
    Object.assign(rates, {
      fiscal_year: "FY2026",
      effective_from: "2026-04",
      effective_to: "2027-03",
      insurer_id: "SYNTHETIC-INSURER",
    });
    const input = {
      month: "2026-09",
      grossYen: 1000000,
      rates,
      healthStandardRemunerationYen: 980000,
      pensionStandardRemunerationYen: 650000,
    };
    expect(computePayrollMonth(input).social_insurance.pension_employee_yen).toBe(59475);
    expect(computePayrollMonth(input).social_insurance.standard_remuneration_yen).toBe(980000);
    expect(() => computePayrollMonth({ ...input, month: "2026-03" })).toThrow("not verified");
    expect(() =>
      computePayrollMonth({ ...input, pensionStandardRemunerationYen: undefined })
    ).toThrow("Separate confirmed");
  });
  it("D1: caps the final monthly charge and stops at disposal", () => {
    const asset = {
      id: "ASSET-999",
      acquisition_cost: 1200000,
      book_value: 123,
      useful_life_years: 1,
      placed_in_service_month: "2026-01",
      depreciation_method: "定額法",
    };
    expect(computeAssetMonthlyDepreciation(asset as never, "2026-09")).toBe(122);
    expect(
      computeAssetMonthlyDepreciation({ ...asset, disposed_month: "2026-08" } as never, "2026-09")
    ).toBe(0);
    expect(() =>
      computeAssetMonthlyDepreciation(
        { ...asset, depreciation_method: "定率法" } as never,
        "2026-09"
      )
    ).toThrow("requires verified");
  });
  it("B1: invoice retry is idempotent and missing counterparty writes nothing", () => {
    resetFixtureJournalEntries();
    const input = {
      invoiceId: "RETRY",
      counterpartyId: "CUST-A",
      amountYen: 10000,
      occurredAt: "2026-09-15T00:00:00Z",
      authorizedBy: "OP-AUDIT",
    };
    postSalesInvoiceJournalEntry(input);
    postSalesInvoiceJournalEntry(input);
    expect(loadJournalEntries().entries).toHaveLength(1);
    expect(() =>
      postSalesInvoiceJournalEntry({ ...input, invoiceId: "INVALID", counterpartyId: undefined })
    ).toThrow("counterparty_id required");
    expect(loadJournalEntries().entries).toHaveLength(1);
  });
  it("D1: cumulative posting never consumes the residual and retry does not duplicate", () => {
    resetFixtureJournalEntries();
    writeFileSync(
      join(dir(), "fixed-assets.yaml"),
      YAML.stringify({
        as_of: "2026-08-31",
        currency: "JPY",
        assets: [
          {
            id: "ASSET-999",
            property_id: "PROP-001",
            name: "Synthetic bounded asset",
            category: "器具備品",
            acquisition_date: "2025-01-01",
            placed_in_service_month: "2025-01",
            acquisition_cost: 1200,
            book_value: 201,
            accumulated_depreciation: 999,
            useful_life_years: 1,
            depreciation_method: "定額法",
            annual_depreciation: 1200,
          },
        ],
      })
    );
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-AUDIT" });
    postDepreciationJournalEntries({ period: "2026-10", authorizedBy: "OP-AUDIT" });
    postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-AUDIT" });
    postDepreciationJournalEntries({ period: "2026-10", authorizedBy: "OP-AUDIT" });
    expect(postDepreciationJournalEntries({ period: "2026-11", authorizedBy: "OP-AUDIT" })).toEqual(
      []
    );
    const rows = loadJournalEntries().entries;
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, e) => s + e.lines.reduce((t, l) => t + l.debit_yen, 0), 0)).toBe(200);
  });
  it("C2: distinguishes missing journal from an explicitly empty ledger", () => {
    resetFixtureJournalEntries();
    expect(buildConsumptionTaxSummary({ period: "2026-09" }).net_tax_yen).toBe(0);
    unlinkSync(join(dir(), "journal-entries.yaml"));
    expect(() => buildConsumptionTaxSummary({ period: "2026-09" })).toThrow(
      "Tax journal is missing"
    );
  });
  it("D1: refuses retroactive posting after a later depreciation month", () => {
    resetFixtureJournalEntries();
    postDepreciationJournalEntries({ period: "2026-11", authorizedBy: "OP-AUDIT" });
    const before = loadJournalEntries().entries.length;
    expect(() =>
      postDepreciationJournalEntries({ period: "2026-09", authorizedBy: "OP-AUDIT" })
    ).toThrow("month order");
    expect(loadJournalEntries().entries).toHaveLength(before);
  });
});
