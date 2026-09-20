import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { assessConsumptionTaxProfile, buildConsumptionTaxSummary } from "../src/lib/finance/consumption-tax.js";
import { assessPurchaseAllocationContinuity, assessSimplifiedTaxEligibility, buildConsumptionTaxFilingDraft, buildInterimReconciliation, calculateAnnualInputTaxAdjustments, calculateConsumptionTaxFilingAmounts, classifyConsumptionTaxFilingIssues, deriveLedgerAnnualInputTaxAdjustments, expectedInterimFrequency, isTwoTenthsReliefEligible } from "../src/lib/finance/consumption-tax-filing.js";
import { consumptionTaxFilingDraftSchema } from "../schemas/finance/consumption-tax-filing.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";
import { getDataDir } from "../src/lib/utils.js";
import { recordConsumptionTaxAdvisorReview, verifyConsumptionTaxAdvisorReviewAudit } from "../src/lib/finance/consumption-tax-advisor-review.js";
import { setupTempCompanyEventsTenant } from "./helpers/temp-company-events-tenant.js";

describe("consumption tax strengthening", () => {
  beforeEach(() => resetFixtureJournalEntries());
  it("includes capitalized assets and applies invoice transitional deduction", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-ASSET-001", occurred_at: "2026-09-20T00:00:00.000Z", description: "asset", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["invoice:ASSET-001"], lines: [
      { account_code: "1200", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, invoice_status: "nonqualified_80", purchase_use: "taxable_only", tax_rounding: "floor" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.input_tax_yen).toBe(8000);
    expect(summary.transaction_count).toBe(1);
  });
  it("reports missing taxpayer basis and allocation policy", () => {
    const result = assessConsumptionTaxProfile({ consumption_tax: { status: "課税事業者", method: "standard", base_period_sales_jpy: 12_000_000 } });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["taxpayer_basis_missing", "purchase_allocation_missing"]));
  });

  it("keeps exactly 10 million yen on the exempt side of the sales threshold", () => {
    expect(assessConsumptionTaxProfile({ consumption_tax: { status: "免税事業者", base_period_sales_jpy: 10_000_000, taxpayer_basis: "base_period" } }).taxable_by_sales).toBe(false);
    expect(assessConsumptionTaxProfile({ consumption_tax: { status: "課税事業者", base_period_sales_jpy: 10_000_001, taxpayer_basis: "base_period" } }).taxable_by_sales).toBe(true);
  });

  it("calculates an explicitly tax-inclusive journal line", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-INCLUSIVE-001", occurred_at: "2026-09-20T00:00:00.000Z", description: "tax inclusive sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["invoice:inclusive"], lines: [
      { account_code: "1100", debit_yen: 110000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 110000, tax_category: "taxable_10", tax_basis: "inclusive" },
    ] });
    expect(buildConsumptionTaxSummary({ period: "2026-09" }).output_tax_yen).toBe(10000);
  });
  it("allocates common input tax by taxable sales ratio", () => {
    useFinanceFixtureTenant();
    for (const [id, account, category] of [["SALE", "4100", "taxable_10"], ["EXEMPT", "4200", "exempt"]] as const) appendJournalEntry({ entry_id: `JE-TAX-${id}-001`, occurred_at: "2026-09-20T00:00:00.000Z", description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}`], lines: [
      { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: account, debit_yen: 0, credit_yen: 100000, tax_category: category },
    ] });
    appendJournalEntry({ entry_id: "JE-TAX-COMMON-001", occurred_at: "2026-09-20T00:00:00.000Z", description: "common", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["invoice:COMMON"], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, invoice_status: "qualified", purchase_use: "common" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.taxable_sales_ratio_pct).toBe(50);
    expect(summary.input_tax_yen).toBe(5000);
  });

  it("applies the taxable-sales ratio once for the whole filing period", () => {
    useFinanceFixtureTenant();
    for (const [id, occurredAt, salesCategory, purchase] of [
      ["TAXABLE", "2026-02-15T00:00:00.000Z", "taxable_10", 100000],
      ["EXEMPT", "2026-03-15T00:00:00.000Z", "exempt", 10000],
    ] as const) {
      appendJournalEntry({ entry_id: `JE-TAX-ANNUAL-${id}-SALE`, occurred_at: occurredAt, description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}:sale`], lines: [
        { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: id === "TAXABLE" ? "4100" : "4200", debit_yen: 0, credit_yen: 100000, tax_category: salesCategory },
      ] });
      appendJournalEntry({ entry_id: `JE-TAX-ANNUAL-${id}-BUY`, occurred_at: occurredAt, description: `${id} common purchase`, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}:buy`], lines: [
        { account_code: "5100", debit_yen: purchase, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: purchase / 10, invoice_status: "qualified", purchase_use: "common" },
        { account_code: "1100", debit_yen: 0, credit_yen: purchase, tax_category: "out_of_scope" },
      ] });
    }
    const annual = buildConsumptionTaxSummary({ period: "2026-02", from: "2026-02-01", to: "2027-01-31", strict: true, profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method: "proportional" } } });
    expect(annual.taxable_sales_ratio_pct).toBe(50);
    expect(annual.input_tax_yen).toBe(5500);
  });

  it("rejects full credit when annual taxable sales exceed 500 million yen", () => {
    const result = buildConsumptionTaxSummary({
      period: "2026-02",
      from: "2026-02-01",
      to: "2027-01-31",
      manual: { taxable_sales_10_yen: 500_000_001, taxable_purchases_10_yen: 100_000 },
      profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method: "full_credit_95_rule" } },
    });
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "full_credit_95_rule_ineligible" })]));
  });

  it("filters transactions before an invoice-registration effective date", () => {
    useFinanceFixtureTenant();
    for (const [id, occurredAt] of [["BEFORE", "2026-08-31T00:00:00.000Z"], ["AFTER", "2026-09-01T00:00:00.000Z"]] as const) {
      appendJournalEntry({ entry_id: `JE-TAX-REG-${id}`, occurred_at: occurredAt, description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}`], lines: [
        { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
      ] });
    }
    const result = buildConsumptionTaxSummary({ period: "2026-02", from: "2026-09-01", to: "2027-01-31", strict: true });
    expect(result.output_tax_yen).toBe(10000);
  });

  it("uses simplified method and deemed purchase rate from the tax profile", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-SIMPLE-SALE", occurred_at: "2026-09-20T00:00:00.000Z", description: "sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:simple"], lines: [
      { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
    ] });
    const summary = buildConsumptionTaxSummary({
      period: "2026-09",
      profile: { consumption_tax: { status: "課税事業者", method: "simplified", deemed_purchase_rate_pct: 50 } },
    });
    expect(summary.method).toBe("simplified");
    expect(summary.deemed_purchase_rate_pct).toBe(50);
    expect(summary.input_tax_yen).toBe(5000);
  });

  it("calculates multiple-business simplified tax and the 75-percent rule", () => {
    useFinanceFixtureTenant();
    for (const [id, amount, business] of [["WHOLESALE", 800000, "type_1"], ["SERVICE", 150000, "type_5"], ["PROPERTY", 50000, "type_6"]] as const) {
      appendJournalEntry({ entry_id: `JE-TAX-MULTI-${id}`, occurred_at: "2026-09-20T00:00:00.000Z", description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}`], lines: [
        { account_code: "1100", debit_yen: amount, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: amount, tax_category: "taxable_10", simplified_business_type: business },
      ] });
    }
    const weighted = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "simplified", simplified_multiple_business: true } } });
    expect(weighted.output_tax_yen).toBe(100000);
    expect(weighted.input_tax_yen).toBe(81500);
    const special = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "simplified", simplified_multiple_business: true, simplified_75_rule: true } } });
    expect(special.input_tax_yen).toBe(90000);
  });

  it("matches the NTA multiple-business 75-percent example", () => {
    // NTA example: wholesale 45%, retail 35%, service 20%. The top two are 80%,
    // so type 1 applies to wholesale and type 2 to all remaining sales.
    // https://www.nta.go.jp/publication/pamph/shohi/aramashi/pdf/001_r02.pdf
    useFinanceFixtureTenant();
    for (const [id, amount, business] of [["WHOLESALE", 450000, "type_1"], ["RETAIL", 350000, "type_2"], ["SERVICE", 200000, "type_5"]] as const) {
      appendJournalEntry({ entry_id: `JE-TAX-NTA-75-${id}`, occurred_at: "2026-09-20T00:00:00.000Z", description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`nta-example:${id}`], lines: [
        { account_code: "1100", debit_yen: amount, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: amount, tax_category: "taxable_10", simplified_business_type: business },
      ] });
    }
    const result = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "simplified", simplified_multiple_business: true, simplified_75_rule: true } } });
    expect(result.output_tax_yen).toBe(100000);
    expect(result.input_tax_yen).toBe(84500);
  });

  it("blocks unclassified sales in multiple-business simplified tax", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-MULTI-UNKNOWN", occurred_at: "2026-09-20T00:00:00.000Z", description: "sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:unknown"], lines: [
      { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "simplified", simplified_multiple_business: true } } });
    expect(summary.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "simplified_business_type_missing" })]));
  });

  it("requires complete simplified-tax eligibility facts", () => {
    expect(assessSimplifiedTaxEligibility({ method: "simplified", periodFrom: "2026-02-01", periodTo: "2027-01-31" })).toEqual(expect.arrayContaining([
      "simplified tax requires base-period taxable sales",
      "simplified tax election filing date missing",
      "simplified tax election effective date missing",
      "business operator kind missing for simplified tax eligibility",
    ]));
    expect(assessSimplifiedTaxEligibility({
      method: "simplified",
      base_period_sales_jpy: 50_000_001,
      simplified_election_filed_on: "2026-01-31",
      simplified_election_effective_from: "2026-02-01",
      simplified_election_filing_basis: "normal",
      simplified_election_evidence_ref: "filing:simplified-election",
      business_operator_kind: "domestic",
      periodFrom: "2026-02-01",
      periodTo: "2027-01-31",
    })).toEqual(["simplified tax is unavailable when base-period taxable sales exceed 50,000,000 yen"]);
  });

  it("rejects simplified tax for a foreign operator without a Japanese PE", () => {
    const base = {
      method: "simplified",
      base_period_sales_jpy: 50_000_000,
      simplified_election_filed_on: "2026-01-31",
      simplified_election_effective_from: "2026-02-01",
      simplified_election_filing_basis: "normal",
      simplified_election_evidence_ref: "filing:simplified-election",
      business_operator_kind: "foreign",
      periodFrom: "2026-02-01",
      periodTo: "2027-01-31",
    } as const;
    expect(assessSimplifiedTaxEligibility(base)).toEqual([
      "foreign business operator without a Japanese permanent establishment cannot use simplified tax",
    ]);
    expect(assessSimplifiedTaxEligibility({ ...base, permanent_establishment_in_japan: true })).toEqual([]);
  });

  it("checks simplified-election filing deadlines and allocation-method continuity", () => {
    expect(assessSimplifiedTaxEligibility({
      method: "simplified", base_period_sales_jpy: 10_000_000,
      simplified_election_filed_on: "2026-02-02", simplified_election_effective_from: "2026-02-01",
      simplified_election_filing_basis: "normal", simplified_election_evidence_ref: "filing:late",
      business_operator_kind: "domestic", periodFrom: "2026-02-01", periodTo: "2027-01-31",
    })).toEqual(expect.arrayContaining(["normal simplified tax election must be filed before the taxable period starts"]));
    expect(assessPurchaseAllocationContinuity({
      currentMethod: "individual", periodFrom: "2026-02-01",
      history: [{ method: "proportional", effective_from: "2025-02-01", evidence_ref: "return:FY2025" }],
    })).toEqual(["individual allocation cannot replace proportional allocation before the two-year continuity period ends"]);
  });

  it("credits import tax only with customs evidence", () => {
    useFinanceFixtureTenant();
    for (const [id, evidence] of [["OK", "permit:001"], ["MISSING", undefined]] as const) appendJournalEntry({ entry_id: `JE-TAX-IMPORT-${id}`, occurred_at: "2026-09-20T00:00:00.000Z", description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}`], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_transaction: "import", tax_amount_yen: 10000, customs_evidence_ref: evidence, import_date: "2026-09-20", customs_declaration_ref: evidence, customs_payment_evidence_ref: evidence, import_national_tax_yen: 7800, import_local_tax_yen: 2200, purchase_use: "taxable_only" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.input_tax_yen).toBe(10000);
    expect(summary.import_national_tax_yen).toBe(15600);
    expect(summary.import_local_tax_yen).toBe(4400);
    expect(summary.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "import_customs_evidence_missing" })]));
  });

  it("calculates fixed-asset and inventory annual input-tax adjustments", () => {
    // Formula and direction are locked to NTA No.6421 and No.6491.
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6421.htm
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6491.htm
    const result = calculateAnnualInputTaxAdjustments({
      fixed_asset_adjustments: [{ asset_id: "ASSET-900", adjustment_fiscal_year: "FY2028", tax_exclusive_cost_yen: 5_000_000, acquisition_input_tax_yen: 500_000, acquisition_taxable_sales_ratio_pct: 40, cumulative_taxable_sales_ratio_pct: 70, held_at_adjustment_period_end: true, allocation_method: "proportional", evidence_ref: "asset-ledger:900" }],
      inventory_tax_adjustments: [{ adjustment_fiscal_year: "FY2028", direction: "taxable_to_exempt", input_tax_yen: 20_000, inventory_record_ref: "inventory:closing" }],
      high_value_assets: [{ asset_id: "ASSET-901", acquired_on: "2027-04-01", tax_exclusive_cost_yen: 10_000_000, kind: "fixed_asset", restriction_end_fiscal_year: "FY2029", evidence_ref: "invoice:901" }],
    }, "FY2028");
    expect(result.total_yen).toBe(130000);
    expect(result.adjustments).toHaveLength(2);
    expect(result.restricted_assets.map((asset) => asset.asset_id)).toEqual(["ASSET-901"]);
  });

  it("derives annual adjustments from fixed-asset and inventory ledgers", () => {
    const profile = deriveLedgerAnnualInputTaxAdjustments({
      fiscalYear: "FY2028", endMonth: 12,
      assets: [{ id: "ASSET-900", property_id: "PROP-900", name: "machine", category: "器具備品", acquisition_date: "2025-04-01", acquisition_cost: 5_500_000, depreciation_method: "定額法", annual_depreciation: 500_000, accumulated_depreciation: 1_500_000, book_value: 4_000_000, consumption_tax: { tax_exclusive_cost_yen: 5_000_000, acquisition_input_tax_yen: 500_000, allocation_method: "proportional", evidence_ref: "invoice:900" } }],
      inventoryMonths: [{ month: "2028-12", consumption_tax_adjustment: { direction: "taxable_to_exempt", input_tax_yen: 20_000, evidence_ref: "inventory:2028" } }],
      salesTotals: (from, to) => from === to ? { taxable_yen: 400_000, total_yen: 1_000_000 } : { taxable_yen: 2_800_000, total_yen: 4_000_000 },
    });
    expect(profile.fixed_asset_adjustments[0]).toMatchObject({ acquisition_taxable_sales_ratio_pct: 40, cumulative_taxable_sales_ratio_pct: 70, held_at_adjustment_period_end: true });
    const result = calculateAnnualInputTaxAdjustments(profile, "FY2028");
    expect(result.total_yen).toBe(130000);
  });

  it("does not mark fixed assets without consumption-tax review as complete", () => {
    const profile = deriveLedgerAnnualInputTaxAdjustments({
      fiscalYear: "FY2028", endMonth: 12,
      assets: [{ id: "ASSET-999", property_id: "PROP-999", name: "unreviewed", category: "建物", acquisition_date: "2025-04-01", acquisition_cost: 5_500_000, depreciation_method: "定額法", annual_depreciation: 500_000, accumulated_depreciation: 1_500_000, book_value: 4_000_000 }],
      inventoryMonths: [], salesTotals: () => ({ taxable_yen: 0, total_yen: 0 }),
    });
    expect(profile.incomplete_assets).toEqual(["ASSET-999"]);
  });

  it("combines import tax, annual adjustments, and interim payment in a full-year filing draft", () => {
    useFinanceFixtureTenant();
    const financeDir = join(getDataDir(), "finance");
    const fixedPath = join(financeDir, "fixed-assets.yaml");
    const inventoryPath = join(financeDir, "inventory.yaml");
    const profilePath = join(financeDir, "tax-profile.yaml");
    const fixedBackup = readFileSync(fixedPath, "utf-8");
    const profileBackup = readFileSync(profilePath, "utf-8");
    const inventoryBackup = existsSync(inventoryPath) ? readFileSync(inventoryPath, "utf-8") : null;
    try {
      writeFileSync(fixedPath, `version: 1\nas_of: "2029-01-31"\nfiscal_year: FY2028\ncurrency: JPY\nassets:\n  - id: ASSET-900\n    property_id: PROP-001\n    name: Adjustment machine\n    category: 器具備品\n    acquisition_date: "2025-04-01"\n    acquisition_cost: 5500000\n    depreciation_method: 定額法\n    annual_depreciation: 500000\n    accumulated_depreciation: 1500000\n    book_value: 4000000\n    consumption_tax:\n      tax_exclusive_cost_yen: 5000000\n      acquisition_input_tax_yen: 500000\n      allocation_method: proportional\n      evidence_ref: invoice:ASSET-900\n`, "utf-8");
      writeFileSync(inventoryPath, `version: 1\nmonths:\n  - month: "2029-01"\n    account_code: "1300"\n    ending_inventory_yen: 0\n    consumption_tax_adjustment:\n      direction: taxable_to_exempt\n      input_tax_yen: 20000\n      evidence_ref: inventory:FY2028\n`, "utf-8");
      writeFileSync(profilePath, `entity:\n  name: Fixture Books KK\n  type: 株式会社\nfiscal_year:\n  end_month: 1\nconsumption_tax:\n  status: 課税事業者\n  method: standard\n  taxpayer_basis: base_period\n  purchase_allocation_method: proportional\n  prior_period_national_tax_yen: 500000\n  interim_filing_frequency: annual_1\ncorporate_tax: {}\n`, "utf-8");
      for (const [id, occurredAt, taxable, exempt] of [["ACQ", "2025-04-01T00:00:00.000Z", 400000, 600000], ["THIRD", "2028-04-01T00:00:00.000Z", 2400000, 600000]] as const) {
        appendJournalEntry({ entry_id: `JE-TAX-E2E-${id}-T`, occurred_at: occurredAt, description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}:taxable`], lines: [
          { account_code: "1100", debit_yen: taxable, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "4100", debit_yen: 0, credit_yen: taxable, tax_category: "taxable_10" },
        ] });
        appendJournalEntry({ entry_id: `JE-TAX-E2E-${id}-E`, occurred_at: occurredAt, description: id, source: { kind: "manual", authorized_by: "test" }, evidence_refs: [`test:${id}:exempt`], lines: [
          { account_code: "1100", debit_yen: exempt, credit_yen: 0, tax_category: "out_of_scope" },
          { account_code: "4200", debit_yen: 0, credit_yen: exempt, tax_category: "exempt" },
        ] });
      }
      appendJournalEntry({ entry_id: "JE-TAX-E2E-IMPORT", occurred_at: "2028-04-15T00:00:00.000Z", description: "customs import", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["permit:FY2028"], lines: [
        { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_transaction: "import", tax_amount_yen: 10000, customs_evidence_ref: "permit:FY2028", import_date: "2028-04-15", customs_declaration_ref: "declaration:FY2028", customs_payment_evidence_ref: "payment:FY2028", import_national_tax_yen: 7800, import_local_tax_yen: 2200, purchase_use: "taxable_only" },
        { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
      ] });
      appendJournalEntry({ entry_id: "JE-TAX-E2E-INTERIM", occurred_at: "2028-09-30T00:00:00.000Z", description: "interim remittance", source: { kind: "remittance", period: "2028-07", obligation: "consumption_tax", filing_kind: "interim", tax_fiscal_year: "FY2028" }, evidence_refs: ["receipt:FY2028-interim"], lines: [
        { account_code: "2160", debit_yen: 320500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 320500, tax_category: "out_of_scope" },
      ] });
      const draft = buildConsumptionTaxFilingDraft("FY2028");
      expect(draft.interim_reconciliation).toMatchObject({ expected_frequency: "annual_1", paid_count: 1, paid_yen: 320500 });
      expect(draft.schedules).toContainEqual({ id: "interim-payments", complete: true });
      expect(draft.input_tax_adjustment_yen).toBe(130000);
      expect(draft.annual_adjustments).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "fixed_asset_ratio", amount_yen: 150000 }),
        expect.objectContaining({ kind: "inventory", amount_yen: -20000 }),
      ]));
      expect(draft.advisor_review.status).toBe("pending");
      expect(draft.schedules).toEqual(expect.arrayContaining([expect.objectContaining({ id: "advisor-review", complete: false })]));
    } finally {
      writeFileSync(fixedPath, fixedBackup, "utf-8");
      writeFileSync(profilePath, profileBackup, "utf-8");
      if (inventoryBackup == null) rmSync(inventoryPath, { force: true });
      else writeFileSync(inventoryPath, inventoryBackup, "utf-8");
      resetFixtureJournalEntries();
    }
  });

  it("applies reverse charge only under standard tax with a ratio below 95 percent", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-RC-SALE-TAXABLE", occurred_at: "2026-09-20T00:00:00.000Z", description: "taxable sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["contract:sale"], lines: [
      { account_code: "1100", debit_yen: 80000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 80000, tax_category: "taxable_10" },
    ] });
    appendJournalEntry({ entry_id: "JE-TAX-RC-SALE-EXEMPT", occurred_at: "2026-09-20T00:00:00.000Z", description: "exempt sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["contract:exempt"], lines: [
      { account_code: "1100", debit_yen: 20000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4200", debit_yen: 0, credit_yen: 20000, tax_category: "exempt" },
    ] });
    appendJournalEntry({ entry_id: "JE-TAX-RC-001", occurred_at: "2026-09-20T00:00:00.000Z", description: "digital service", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["contract:rc"], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_transaction: "reverse_charge", tax_amount_yen: 10000, purchase_use: "common" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const below = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method: "individual", taxable_sales_ratio_override_pct: 70, taxable_sales_ratio_override_evidence_ref: "approval:ratio", taxable_sales_ratio_override_evidence_sha256: "a".repeat(64) } } });
    expect(below.taxable_sales_ratio_pct).toBe(80);
    expect(below.input_tax_allocation_ratio_pct).toBe(70);
    expect(below.reverse_charge_tax_yen).toBe(10000);
    expect(below.input_tax_yen).toBe(7000);
  });

  it("does not use an approved ratio for the 95-percent test or proportional allocation", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-RATIO-SALE-TAXABLE", occurred_at: "2026-09-20T00:00:00.000Z", description: "taxable sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:sale"], lines: [
      { account_code: "1100", debit_yen: 90000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 90000, tax_category: "taxable_10" },
    ] });
    appendJournalEntry({ entry_id: "JE-TAX-RATIO-SALE-EXEMPT", occurred_at: "2026-09-20T00:00:00.000Z", description: "exempt sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:exempt"], lines: [
      { account_code: "1100", debit_yen: 10000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4200", debit_yen: 0, credit_yen: 10000, tax_category: "exempt" },
    ] });
    appendJournalEntry({ entry_id: "JE-TAX-RATIO-BUY", occurred_at: "2026-09-20T00:00:00.000Z", description: "common purchase", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:purchase"], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, invoice_status: "qualified", purchase_use: "common" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const fullCredit = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method: "full_credit_95_rule", taxable_sales_ratio_override_pct: 100, taxable_sales_ratio_override_evidence_ref: "approval:ratio", taxable_sales_ratio_override_evidence_sha256: "a".repeat(64) } } });
    expect(fullCredit.taxable_sales_ratio_pct).toBe(90);
    expect(fullCredit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "taxable_sales_ratio_override_not_applicable" }),
      expect.objectContaining({ code: "full_credit_95_rule_ineligible" }),
    ]));

    const proportional = buildConsumptionTaxSummary({ period: "2026-09", profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method: "proportional", taxable_sales_ratio_override_pct: 100, taxable_sales_ratio_override_evidence_ref: "approval:ratio", taxable_sales_ratio_override_evidence_sha256: "a".repeat(64) } } });
    expect(proportional.input_tax_allocation_ratio_pct).toBe(90);
    expect(proportional.input_tax_yen).toBe(9000);
  });

  it.each(["proportional", "full_credit_95_rule"] as const)(
    "%s keeps the invoice transitional deduction",
    (purchase_allocation_method) => {
      useFinanceFixtureTenant();
      const allocationId = purchase_allocation_method.toUpperCase().replaceAll("_", "-");
      appendJournalEntry({ entry_id: `JE-TAX-${allocationId}-SALE`, occurred_at: "2026-09-20T00:00:00.000Z", description: "sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:sale"], lines: [
        { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
      ] });
      appendJournalEntry({ entry_id: `JE-TAX-${allocationId}-BUY`, occurred_at: "2026-09-20T00:00:00.000Z", description: "purchase", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:purchase"], lines: [
        { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, invoice_status: "nonqualified_80", purchase_use: "common" },
        { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
      ] });
      const summary = buildConsumptionTaxSummary({
        period: "2026-09",
        profile: { consumption_tax: { status: "課税事業者", method: "standard", purchase_allocation_method } },
      });
      expect(summary.taxable_sales_ratio_pct).toBe(100);
      expect(summary.gross_input_tax_yen).toBe(10000);
      expect(summary.input_tax_yen).toBe(8000);
      expect(summary.non_deductible_input_tax_yen).toBe(2000);
    },
  );

  it("gives no input credit when invoice status is missing", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-NO-INVOICE", occurred_at: "2026-09-20T00:00:00.000Z", description: "purchase", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:no-invoice"], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, purchase_use: "taxable_only" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.input_tax_yen).toBe(0);
    expect(summary.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invoice_status_missing" })]));
    expect(classifyConsumptionTaxFilingIssues([summary]).blockers).toHaveLength(1);
  });

  it.each([
    ["2026-09-30", "nonqualified_80", 8000],
    ["2026-10-01", "nonqualified_50", 5000],
    ["2026-10-01", "nonqualified_80", 0],
    ["2029-10-01", "nonqualified_50", 0],
  ] as const)("validates transitional invoice status on %s", (occurredOn, invoice_status, expected) => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: `JE-TAX-TRANS-${occurredOn.replaceAll("-", "")}-${invoice_status === "nonqualified_80" ? "80" : "50"}`, occurred_at: `${occurredOn}T00:00:00.000Z`, description: "purchase", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["test:transition"], lines: [
      { account_code: "5100", debit_yen: 100000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 10000, invoice_status, purchase_use: "taxable_only" },
      { account_code: "1100", debit_yen: 0, credit_yen: 100000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: occurredOn.slice(0, 7) });
    expect(summary.input_tax_yen).toBe(expected);
    expect(summary.issues?.some((issue) => issue.code === "invoice_transitional_period_mismatch")).toBe(expected === 0);
  });

  it("applies filing-unit rounding and separates national and local consumption tax", () => {
    expect(calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 1_234_567,
      taxable_sales_8_yen: 234_567,
      deductible_input_tax_yen: 12_345,
    })).toMatchObject({
      taxable_base_10_yen: 1_234_000,
      taxable_base_8_yen: 234_000,
      national_output_tax_yen: 110_853,
      national_input_tax_yen: 9_629,
      national_tax_yen: 101_200,
      local_consumption_tax_yen: 28_500,
      combined_tax_yen: 129_700,
    });
  });

  it("carries reverse-charge output tax into national and local filing amounts", () => {
    expect(calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 0,
      taxable_sales_8_yen: 0,
      deductible_input_tax_yen: 0,
      reverse_charge_output_tax_yen: 10_000,
    })).toMatchObject({
      national_output_tax_yen: 7_800,
      national_tax_yen: 7_800,
      local_consumption_tax_yen: 2_200,
      combined_tax_yen: 10_000,
    });
  });

  it("collects a negative annual input adjustment as recapture tax", () => {
    expect(calculateConsumptionTaxFilingAmounts({
      taxable_sales_10_yen: 0,
      taxable_sales_8_yen: 0,
      deductible_input_tax_yen: 0,
      input_tax_recapture_yen: 20_000,
    })).toMatchObject({
      national_output_tax_yen: 15_600,
      national_input_tax_yen: 0,
      national_tax_yen: 15_600,
      local_consumption_tax_yen: 4_400,
      combined_tax_yen: 20_000,
    });
  });

  it("rejects an unaudited advisor approval and stale calculation digest", () => {
    useFinanceFixtureTenant();
    const profilePath = join(getDataDir(), "finance", "tax-profile.yaml");
    const profileBackup = readFileSync(profilePath, "utf-8");
    const baseProfile = `entity:\n  name: Fixture Books KK\n  type: 株式会社\nfiscal_year:\n  end_month: 1\nconsumption_tax:\n  status: 課税事業者\n  method: standard\n  taxpayer_basis: base_period\n  purchase_allocation_method: proportional\n  prior_period_national_tax_yen: 0\n  interim_filing_frequency: none\ncorporate_tax: {}\n`;
    try {
      writeFileSync(profilePath, baseProfile, "utf-8");
      const pending = buildConsumptionTaxFilingDraft("FY2026");
      expect(pending.calculation_sha256).toMatch(/^[a-f0-9]{64}$/);

      writeFileSync(profilePath, baseProfile.replace("corporate_tax: {}", `  advisor_reviews:\n    - fiscal_year: FY2026\n      status: approved\n      reviewer_ref: advisor:fixture\n      reviewed_at: 2027-03-01T00:00:00.000Z\n      evidence_ref: review:FY2026\n      evidence_sha256: ${"b".repeat(64)}\n      calculation_sha256: ${pending.calculation_sha256}\n      audit_event_id: EVT-20270301-compliance-fake-review\ncorporate_tax: {}`), "utf-8");
      const approved = buildConsumptionTaxFilingDraft("FY2026");
      expect(approved.advisor_review).toMatchObject({ status: "approved", matches_calculation: true, audit_verified: false });
      expect(approved.blockers).toEqual(expect.arrayContaining([expect.stringContaining("tax advisor review audit invalid")]));

      appendJournalEntry({ entry_id: "JE-TAX-AFTER-REVIEW", occurred_at: "2026-09-20T00:00:00.000Z", description: "late sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["invoice:late"], lines: [
        { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
      ] });
      const stale = buildConsumptionTaxFilingDraft("FY2026");
      expect(stale.advisor_review.matches_calculation).toBe(false);
      expect(stale.blockers).toContain("tax advisor review calculation hash mismatch for FY2026");
    } finally {
      writeFileSync(profilePath, profileBackup, "utf-8");
      resetFixtureJournalEntries();
    }
  });

  it("records an advisor decision in the verifiable company-event chain", () => {
    const isolated = setupTempCompanyEventsTenant();
    try {
      const tenantConfigPath = join(isolated.dir, "tenants", isolated.tenantId, "tenant.yaml");
      writeFileSync(tenantConfigPath, `${readFileSync(tenantConfigPath, "utf-8")}jurisdiction: JP\n`, "utf-8");
      const financeDir = join(getDataDir(), "finance");
      mkdirSync(financeDir, { recursive: true });
      writeFileSync(join(financeDir, "tax-profile.yaml"), `entity:\n  name: Audit Fixture KK\n  type: 株式会社\nfiscal_year:\n  end_month: 1\nconsumption_tax:\n  status: 課税事業者\n  method: standard\ncorporate_tax: {}\n`, "utf-8");
      const payload = {
        fiscal_year: "FY2026",
        status: "approved" as const,
        reviewer_ref: "advisor:licensed-001",
        reviewed_at: "2027-03-01T00:00:00.000Z",
        evidence_ref: "review:FY2026",
        evidence_sha256: "b".repeat(64),
        calculation_sha256: "c".repeat(64),
      };
      const recorded = recordConsumptionTaxAdvisorReview(payload);
      expect(verifyConsumptionTaxAdvisorReviewAudit({ ...payload, ...recorded })).toEqual({ ok: true });
      expect(() => recordConsumptionTaxAdvisorReview(payload)).toThrow(/already recorded/);
    } finally {
      isolated.restore();
      useFinanceFixtureTenant();
    }
  });

  it("rejects a filing draft whose totals do not reconcile", () => {
    const parsed = consumptionTaxFilingDraftSchema.safeParse({
      fiscal_year: "FY2026", submission: "not-for-etax", status: "ready_for_advisor_review",
      policy_id: "jp-consumption-tax-2023-10", output_tax_yen: 10000,
      deductible_input_tax_yen: 0, net_tax_yen: 9900,
      taxable_base_10_yen: 100000, taxable_base_8_yen: 0,
      national_output_tax_yen: 7800, national_input_tax_yen: 0,
      national_tax_yen: 7800, local_consumption_tax_yen: 2200,
      combined_tax_yen: 9900, remitted_yen: 0, remaining_yen: 9900,
      taxable_sales_ratio_pct: 100, schedules: [], blockers: [], warnings: [],
    });
    expect(parsed.success).toBe(false);
  });

  it.each([
    [480_000, "none"], [480_001, "annual_1"], [4_000_001, "annual_3"], [48_000_001, "annual_11"],
  ] as const)("derives interim frequency from prior national tax %s", (tax, expected) => {
    expect(expectedInterimFrequency(tax, false)).toBe(expected);
  });

  it("builds and reconciles an interim payment schedule", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-INTERIM-001", occurred_at: "2026-09-30T00:00:00.000Z", description: "interim", source: { kind: "remittance", period: "2026-07", obligation: "consumption_tax", filing_kind: "interim", tax_fiscal_year: "FY2026" }, evidence_refs: ["receipt:interim"], lines: [
      { account_code: "2160", debit_yen: 320500, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "1100", debit_yen: 0, credit_yen: 320500, tax_category: "out_of_scope" },
    ] });
    const result = buildInterimReconciliation({ from: "2026-02-01", fiscalYear: "FY2026", priorNationalTax: 500000, configured: "annual_1", voluntary: false });
    expect(result.expected_count).toBe(1);
    expect(result.periods[0]).toMatchObject({ period: "2026-07", paid_yen: 320500, status: "paid" });
  });

  it("matches the NTA quarterly interim installment formula", () => {
    // Prior national tax above 4,000,000 yen requires three filings; each is
    // three-twelfths of national tax plus local tax at 22/78, rounded per filing.
    // https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm
    useFinanceFixtureTenant();
    const result = buildInterimReconciliation({ from: "2026-02-01", fiscalYear: "FY2026", priorNationalTax: 4_800_000, configured: "annual_3", voluntary: false });
    expect(result.expected_count).toBe(3);
    expect(result.periods.map((period) => period.expected_yen)).toEqual([1_538_400, 1_538_400, 1_538_400]);
    expect(result.expected_yen).toBe(4_615_200);
  });

  it("applies two-tenths relief only when eligibility facts are complete", () => {
    expect(isTwoTenthsReliefEligible({ period_from: "2026-02-01", invoice_registered: true, pre_registration_exempt: true, shortened_tax_period: false, base_period_sales_jpy: 9_000_000 })).toBe(true);
    expect(isTwoTenthsReliefEligible({ period_from: "2026-02-01", invoice_registered: true, pre_registration_exempt: false, shortened_tax_period: false, base_period_sales_jpy: 9_000_000 })).toBe(false);
    const filed = calculateConsumptionTaxFilingAmounts({ taxable_sales_10_yen: 1_000_000, taxable_sales_8_yen: 0, deductible_input_tax_yen: 0, two_tenths_relief: true });
    expect(filed.national_tax_yen).toBe(15_600);
    expect(filed.local_consumption_tax_yen).toBe(4_400);
    expect(filed.combined_tax_yen).toBe(20_000);
  });

  it.each(["sales_return", "sales_discount", "bad_debt"] as const)("adjusts output tax for %s", (tax_adjustment) => {
    useFinanceFixtureTenant();
    appendJournalEntry({ entry_id: "JE-TAX-ADJUST-SALE", occurred_at: "2026-09-01T00:00:00.000Z", description: "sale", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["invoice:sale"], lines: [
      { account_code: "1100", debit_yen: 100000, credit_yen: 0, tax_category: "out_of_scope" },
      { account_code: "4100", debit_yen: 0, credit_yen: 100000, tax_category: "taxable_10" },
    ] });
    appendJournalEntry({ entry_id: `JE-TAX-ADJUST-${tax_adjustment.toUpperCase().replaceAll("_", "-")}`, occurred_at: "2026-09-20T00:00:00.000Z", description: "adjustment", source: { kind: "manual", authorized_by: "test" }, evidence_refs: ["evidence:adjustment"], lines: [
      { account_code: "4100", debit_yen: 20000, credit_yen: 0, tax_category: "taxable_10", tax_amount_yen: 2000, tax_adjustment, original_entry_id: "JE-TAX-ADJUST-SALE" },
      { account_code: "1100", debit_yen: 0, credit_yen: 20000, tax_category: "out_of_scope" },
    ] });
    const summary = buildConsumptionTaxSummary({ period: "2026-09" });
    expect(summary.output_tax_yen).toBe(8000);
    expect(summary.output_tax_adjustment_yen).toBe(2000);
  });
});
