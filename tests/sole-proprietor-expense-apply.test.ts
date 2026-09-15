import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyExpenseIntakeSideEffects } from "../src/lib/finance/sole-proprietor-expense-apply.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import type { BlueReturnExpenseIntake } from "../schemas/finance/blue-return-expense-intake.js";

const TENANT = "_fixture-sole-prop";

function resetJournals(): void {
  writeFileSync(
    join(getTenantDir(), "data/finance/journal-entries.yaml"),
    "version: 1\nentries: []\n",
    "utf-8",
  );
}

function resetAssets(): void {
  writeFileSync(
    join(getTenantDir(), "data/finance/fixed-assets.yaml"),
    `as_of: "2026-12-31"
fiscal_year: CY2026
currency: JPY
assets: []
summary:
  total_acquisition_cost: 0
  total_accumulated_depreciation: 0
  total_book_value: 0
  annual_depreciation_fy_current: 0
`,
    "utf-8",
  );
}

describe("expense-intake apply side effects", () => {
  beforeEach(() => {
    setTenantId(TENANT);
    mkdirSync(join(getTenantDir(), "data/finance"), { recursive: true });
    resetJournals();
    resetAssets();
  });

  afterEach(() => {
    resetJournals();
    resetAssets();
  });

  it("posts expense journal with tax split", () => {
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-TEST1",
      reported_at: "2026-03-01T00:00:00.000Z",
      amount_yen: 11000,
      tax_inclusive: true,
      business_use: "business_only",
      amount_band: "under_100k",
      depreciation_choice: "expense",
      occurred_on: "2026-03-01",
      paid_on: "2026-03-01",
      expense_line: "消耗品費",
      account_code: "5100",
      evidence_refs: ["test:receipt"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "current_expense",
      status: "complete",
    };
    const result = applyExpenseIntakeSideEffects(intake);
    expect(result.journal_posted).toBe(true);
    expect(result.journal_entry_id).toBe("JE-EI-2026-TEST1");
    const entry = loadJournalEntries().entries.find(
      (e) => e.entry_id === result.journal_entry_id,
    );
    expect(entry).toBeTruthy();
    expect(entry!.lines.some((l) => l.account_code === "5100" && l.debit_yen === 10000)).toBe(
      true,
    );
    expect(entry!.lines.some((l) => l.account_code === "2170" && l.debit_yen === 1000)).toBe(
      true,
    );
  });

  it("registers lump_sum fixed asset and is idempotent", () => {
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-LUMP",
      reported_at: "2026-04-01T00:00:00.000Z",
      amount_yen: 150000,
      tax_inclusive: true,
      business_use: "business_only",
      amount_band: "from_100k_to_200k",
      depreciation_choice: "lump_sum",
      occurred_on: "2026-04-01",
      paid_on: "2026-04-01",
      placed_in_service_month: "2026-04",
      expense_line: "器具備品",
      account_code: "5100",
      evidence_refs: ["test:invoice"],
      invoice_qualified: true,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "capex",
      timing: "current_expense",
      status: "complete",
    };
    const first = applyExpenseIntakeSideEffects(intake);
    expect(first.fixed_asset_id).toMatch(/^ASSET-/);
    expect(first.journal_posted).toBe(true);
    const second = applyExpenseIntakeSideEffects(intake);
    expect(second.journal_posted).toBe(false);
    expect(loadJournalEntries().entries.filter((e) => e.entry_id === first.journal_entry_id)).toHaveLength(
      1,
    );
  });

  it("posts prepaid to 1180", () => {
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-PRE",
      reported_at: "2026-05-01T00:00:00.000Z",
      amount_yen: 12000,
      tax_inclusive: true,
      business_use: "business_only",
      amount_band: "under_100k",
      depreciation_choice: "expense",
      occurred_on: "2026-05-01",
      paid_on: "2026-05-01",
      expense_line: "前払",
      account_code: "5100",
      evidence_refs: ["test:pre"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "prepaid",
      status: "complete",
    };
    const result = applyExpenseIntakeSideEffects(intake);
    expect(result.journal_posted).toBe(true);
    const entry = loadJournalEntries().entries.find(
      (e) => e.entry_id === result.journal_entry_id,
    );
    expect(entry!.lines.some((l) => l.account_code === "1180" && l.debit_yen === 12000)).toBe(
      true,
    );
  });

  it("splits prepaid shared use onto 1180 and 3210", () => {
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-PRE-SHARE",
      reported_at: "2026-05-02T00:00:00.000Z",
      amount_yen: 10000,
      tax_inclusive: true,
      business_use: "shared",
      business_pct: 70,
      amount_band: "under_100k",
      depreciation_choice: "expense",
      occurred_on: "2026-05-02",
      paid_on: "2026-05-02",
      expense_line: "前払",
      account_code: "5100",
      evidence_refs: ["test:pre-share"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "prepaid",
      status: "complete",
    };
    const result = applyExpenseIntakeSideEffects(intake);
    expect(result.journal_posted).toBe(true);
    const entry = loadJournalEntries().entries.find(
      (e) => e.entry_id === result.journal_entry_id,
    );
    expect(entry!.lines.some((l) => l.account_code === "1180" && l.debit_yen === 7000)).toBe(
      true,
    );
    expect(entry!.lines.some((l) => l.account_code === "3210" && l.debit_yen === 3000)).toBe(
      true,
    );
  });

  it("posts accrued with payable credit and household draw", () => {
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-ACC",
      reported_at: "2026-06-01T00:00:00.000Z",
      amount_yen: 11000,
      tax_inclusive: true,
      business_use: "shared",
      business_pct: 50,
      amount_band: "under_100k",
      depreciation_choice: "expense",
      occurred_on: "2026-06-01",
      paid_on: "2026-06-01",
      expense_line: "消耗品費",
      account_code: "5100",
      evidence_refs: ["test:acc"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "accrued",
      status: "complete",
    };
    const result = applyExpenseIntakeSideEffects(intake);
    expect(result.journal_posted).toBe(true);
    const entry = loadJournalEntries().entries.find(
      (e) => e.entry_id === result.journal_entry_id,
    );
    expect(entry!.lines.some((l) => l.account_code === "3210" && l.debit_yen === 5500)).toBe(
      true,
    );
    expect(entry!.lines.some((l) => l.account_code === "2110" && l.credit_yen === 11000)).toBe(
      true,
    );
  });
});

describe("prepaid year-end transfer", () => {
  beforeEach(() => {
    setTenantId(TENANT);
    mkdirSync(join(getTenantDir(), "data/finance"), { recursive: true });
    resetJournals();
    writeFileSync(
      join(getTenantDir(), "data/finance/blue-return-expense-intakes.yaml"),
      `version: 1
intakes: []
`,
      "utf-8",
    );
  });

  afterEach(() => {
    resetJournals();
    writeFileSync(
      join(getTenantDir(), "data/finance/blue-return-expense-intakes.yaml"),
      `version: 1
intakes: []
`,
      "utf-8",
    );
  });

  it("posts JE-PRE idempotently after prepaid intake", async () => {
    const { saveBlueReturnExpenseIntakes, loadBlueReturnExpenseIntakes } = await import(
      "../src/lib/finance/sole-proprietor-clarify.js"
    );
    const { postPrepaidYearTransfers } = await import(
      "../src/lib/finance/sole-prop-prepaid-transfer.js"
    );
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-PRE-XFER",
      reported_at: "2026-05-01T00:00:00.000Z",
      amount_yen: 11000,
      tax_inclusive: true,
      business_use: "business_only",
      amount_band: "under_100k",
      depreciation_choice: "expense",
      occurred_on: "2026-05-01",
      paid_on: "2026-05-01",
      expense_line: "前払",
      account_code: "5100",
      evidence_refs: ["test:xfer"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "prepaid",
      status: "complete",
    };
    applyExpenseIntakeSideEffects(intake);
    const file = loadBlueReturnExpenseIntakes();
    file.intakes = [intake];
    saveBlueReturnExpenseIntakes(file);

    const first = postPrepaidYearTransfers({ calendarYear: 2026 });
    expect(first.posted).toContain("JE-PRE-EI-2026-PRE-XFER-2026");
    const entry = loadJournalEntries().entries.find(
      (e) => e.entry_id === "JE-PRE-EI-2026-PRE-XFER-2026",
    );
    expect(entry!.lines.some((l) => l.account_code === "1180" && l.credit_yen === 11000)).toBe(
      true,
    );
    expect(entry!.lines.some((l) => l.account_code === "5100" && l.debit_yen === 10000)).toBe(
      true,
    );
    const second = postPrepaidYearTransfers({ calendarYear: 2026 });
    expect(second.posted).toHaveLength(0);
    expect(second.skipped).toContain("JE-PRE-EI-2026-PRE-XFER-2026");
  });
});

describe("lump-sum year amortization", () => {
  beforeEach(() => {
    setTenantId(TENANT);
    mkdirSync(join(getTenantDir(), "data/finance"), { recursive: true });
    writeFileSync(
      join(getTenantDir(), "data/finance/journal-entries.yaml"),
      "version: 1\nentries: []\n",
      "utf-8",
    );
    writeFileSync(
      join(getTenantDir(), "data/finance/fixed-assets.yaml"),
      `as_of: "2026-12-31"
fiscal_year: CY2026
currency: JPY
assets: []
summary:
  total_acquisition_cost: 0
  total_accumulated_depreciation: 0
  total_book_value: 0
  annual_depreciation_fy_current: 0
`,
      "utf-8",
    );
  });

  it("posts JE-LUMP idempotently", async () => {
    const { postLumpSumYearAmortization } = await import(
      "../src/lib/finance/sole-prop-depreciation.js"
    );
    const intake: BlueReturnExpenseIntake = {
      intake_id: "EI-2026-LUMP2",
      reported_at: "2026-04-01T00:00:00.000Z",
      amount_yen: 150000,
      tax_inclusive: true,
      business_use: "business_only",
      amount_band: "from_100k_to_200k",
      depreciation_choice: "lump_sum",
      occurred_on: "2026-04-01",
      paid_on: "2026-04-01",
      placed_in_service_month: "2026-04",
      expense_line: "器具備品",
      account_code: "1300",
      evidence_refs: ["test:lump2"],
      invoice_qualified: true,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "capex",
      timing: "current_expense",
      status: "complete",
    };
    applyExpenseIntakeSideEffects(intake);
    const first = postLumpSumYearAmortization({ calendarYear: 2026 });
    expect(first.posted.length).toBeGreaterThanOrEqual(1);
    const second = postLumpSumYearAmortization({ calendarYear: 2026 });
    expect(second.posted.length).toBe(0);
    expect(second.skipped.length).toBeGreaterThanOrEqual(1);
  });
});
