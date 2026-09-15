import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLUE_RETURN_DEDUCTION_55,
  BLUE_RETURN_DEDUCTION_65,
  BASIC_DEDUCTION_YEN,
  STATUTORY_EXPENSE_LINES,
  buildFormBDraft,
  buildBlueReturnKessan,
  computeIncomeTaxYen,
  computeReconstructionSurtaxYen,
  truncateTaxableIncomeYen,
  writeBooksPack,
  writeFormBDraft,
  writeKessanDraft,
} from "../src/lib/finance/sole-proprietor-blue-return.js";
import { getDocsDir } from "../src/lib/utils.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = "_fixture-sole-prop";
const YEAR = 2026;

const EMPTY_JOURNALS = "version: 1\nentries: []\n";
const DEFAULT_ALLOC = `version: 1
calendar_year: 2026
default_business_pct: 100
by_account: {}
by_entry: {}
`;
const DEFAULT_EXPENSE_MAP = `version: 1
lines:
  "5100": 雑費
default_expense_line: 雑費
`;

function financePath(...parts: string[]): string {
  return join(getTenantDir(), "data/finance", ...parts);
}

function writeSyntheticJournals(opts?: { withInventory?: boolean }): void {
  const inventory = opts?.withInventory
    ? `
  - entry_id: JE-2025-INV
    occurred_at: "2025-12-20T00:00:00.000Z"
    description: 期首棚卸（前年）
    lines:
      - account_code: "1210"
        debit_yen: 30000
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "3100"
        debit_yen: 0
        credit_yen: 30000
        tax_category: out_of_scope
    evidence_refs:
      - test:inventory
    source:
      kind: manual
      authorized_by: vitest
`
    : "";
  const yaml = `version: 1
entries:${inventory}
  - entry_id: JE-2026-001
    occurred_at: "2026-03-15T00:00:00.000Z"
    description: 売上（現金）
    lines:
      - account_code: "1100"
        debit_yen: 2000000
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "4100"
        debit_yen: 0
        credit_yen: 2000000
        tax_category: out_of_scope
    evidence_refs:
      - test:sole-prop-sales
    source:
      kind: manual
      authorized_by: vitest
  - entry_id: JE-2026-002
    occurred_at: "2026-06-20T00:00:00.000Z"
    description: 消耗品費
    lines:
      - account_code: "5100"
        debit_yen: 100000
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "1100"
        debit_yen: 0
        credit_yen: 100000
        tax_category: out_of_scope
    evidence_refs:
      - test:sole-prop-expense
    source:
      kind: manual
      authorized_by: vitest
  - entry_id: JE-2027-999
    occurred_at: "2027-01-05T00:00:00.000Z"
    description: 翌年売上（期間外）
    lines:
      - account_code: "1100"
        debit_yen: 50000
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "4100"
        debit_yen: 0
        credit_yen: 50000
        tax_category: out_of_scope
    evidence_refs:
      - test:sole-prop-next
    source:
      kind: manual
      authorized_by: vitest
`;
  writeFileSync(financePath("journal-entries.yaml"), yaml, "utf-8");
}

function resetFixture(): void {
  setTenantId(TENANT);
  writeFileSync(financePath("journal-entries.yaml"), EMPTY_JOURNALS, "utf-8");
  writeFileSync(financePath("blue-return-allocation.yaml"), DEFAULT_ALLOC, "utf-8");
  writeFileSync(financePath("blue-return-expense-map.yaml"), DEFAULT_EXPENSE_MAP, "utf-8");
  writeFileSync(
    financePath("blue-return-filing.yaml"),
    "version: 1\ncalendar_year: 2026\nnotes: fixture\n",
    "utf-8",
  );
  const out = join(getDocsDir(), "finance", "blue-return", String(YEAR));
  rmSync(out, { recursive: true, force: true });
}

describe("sole proprietor blue return synthetic journal E2E", () => {
  beforeEach(() => {
    resetFixture();
    writeSyntheticJournals();
  });

  afterEach(() => {
    resetFixture();
  });

  it("books → kessan → Form B amounts match and exclude out-of-period journals", () => {
    const books = writeBooksPack(YEAR);
    expect(books.period_entry_count).toBe(2);

    const shiwake = readFileSync(
      join(getDocsDir(), "finance/blue-return/2026/shiwakecho.md"),
      "utf-8",
    );
    expect(shiwake).toContain("JE-2026-001");
    expect(shiwake).toContain("JE-2026-002");
    expect(shiwake).not.toContain("JE-2027-999");
    expect(shiwake).toContain("件数: 2（期間内）");

    const hojobo = readFileSync(
      join(getDocsDir(), "finance/blue-return/2026/hojobo.md"),
      "utf-8",
    );
    expect(hojobo).toContain("期首繰越");
    expect(hojobo).toContain("現金・預金出納帳");
    expect(hojobo).toContain("売掛帳");
    expect(hojobo).toContain("買掛帳");
    expect(hojobo).toContain("経費帳");
    expect(hojobo).toContain("事業%");
    expect(hojobo).toMatch(/1,900,000/);

    const shisan = readFileSync(
      join(getDocsDir(), "finance/blue-return/2026/shisanhyo.md"),
      "utf-8",
    );
    expect(shisan).toContain("as-of 累積試算");

    const { kessan } = writeKessanDraft(YEAR);
    expect(kessan.revenue_yen).toBe(2_000_000);
    expect(kessan.expenses_yen).toBe(100_000);
    expect(kessan.expense_lines).toHaveLength(STATUTORY_EXPENSE_LINES.length);
    expect(kessan.expense_lines.find((l) => l.label === "雑費")?.amount_yen).toBe(100_000);
    expect(kessan.beginning_inventory_yen).toBe(0);
    expect(kessan.ending_inventory_yen).toBe(0);
    expect(kessan.income_before_blue_deduction_yen).toBe(1_900_000);
    expect(kessan.blue_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_55);
    expect(kessan.business_income_yen).toBe(1_900_000 - BLUE_RETURN_DEDUCTION_55);
    expect(kessan.balance_sheet.income_before_on_bs_yen).toBe(
      kessan.income_before_blue_deduction_yen,
    );
    expect(kessan.balance_sheet.assets.length).toBeGreaterThanOrEqual(3);
    expect(kessan.issues).toEqual([]);

    const { draft } = writeFormBDraft(YEAR);
    const expectedTaxable = truncateTaxableIncomeYen(
      kessan.business_income_yen - BASIC_DEDUCTION_YEN,
    );
    expect(draft.taxable_income_yen).toBe(expectedTaxable);
    expect(draft.income_tax_yen).toBe(computeIncomeTaxYen(expectedTaxable));
    expect(draft.reconstruction_surtax_yen).toBe(
      computeReconstructionSurtaxYen(draft.income_tax_yen),
    );
    expect(draft.tax_payable_yen).toBe(
      draft.income_tax_yen + draft.reconstruction_surtax_yen,
    );
    expect(draft.tax_payable_yen).toBeGreaterThan(0);
    expect(draft.deduction_gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_55);
    expect(draft.deduction_gate.books_ready).toBe(true);
  });

  it("empty books still emit statutory expense rows and major BS lines", () => {
    writeFileSync(financePath("journal-entries.yaml"), EMPTY_JOURNALS, "utf-8");
    writeBooksPack(YEAR);
    const kessan = buildBlueReturnKessan(YEAR);
    expect(kessan.revenue_yen).toBe(0);
    expect(kessan.expense_lines).toHaveLength(18);
    expect(kessan.expense_lines.every((l) => l.amount_yen === 0)).toBe(true);
    expect(kessan.balance_sheet.assets.map((a) => a.label)).toEqual(
      expect.arrayContaining(["現金及び預金", "売掛金", "棚卸資産"]),
    );
    expect(kessan.income_before_blue_deduction_yen).toBe(0);
    expect(kessan.blue_deduction_yen).toBe(0);

    const form = buildFormBDraft(YEAR);
    expect(form.tax_payable_yen).toBe(0);
  });

  it("reads beginning inventory from prior-year 1210 balance", () => {
    writeSyntheticJournals({ withInventory: true });
    writeBooksPack(YEAR);
    const kessan = buildBlueReturnKessan(YEAR);
    expect(kessan.beginning_inventory_yen).toBe(30_000);
    expect(kessan.ending_inventory_yen).toBe(30_000);
    expect(kessan.cost_of_sales_yen).toBe(0);
    expect(kessan.income_before_blue_deduction_yen).toBe(1_900_000);
  });

  it("maps expense account to 消耗品費 via expense-map", () => {
    writeFileSync(
      financePath("blue-return-expense-map.yaml"),
      `version: 1
lines:
  "5100": 消耗品費
default_expense_line: 雑費
`,
      "utf-8",
    );
    writeBooksPack(YEAR);
    const kessan = buildBlueReturnKessan(YEAR);
    expect(kessan.expense_lines.find((l) => l.label === "消耗品費")?.amount_yen).toBe(100_000);
    expect(kessan.expense_lines.find((l) => l.label === "雑費")?.amount_yen).toBe(0);
  });

  it("applies household/business allocation pct to expenses", () => {
    writeFileSync(
      financePath("blue-return-allocation.yaml"),
      `version: 1
calendar_year: 2026
default_business_pct: 100
by_account:
  "5100":
    business_pct: 60
    method: floor_area
    notes: "自宅兼用"
by_entry: {}
`,
      "utf-8",
    );
    writeBooksPack(YEAR);
    const { kessan } = writeKessanDraft(YEAR);
    expect(kessan.expenses_gross_yen).toBe(100_000);
    expect(kessan.expenses_yen).toBe(60_000);
    expect(kessan.allocation.household_total_yen).toBe(40_000);
    expect(kessan.income_before_blue_deduction_yen).toBe(1_940_000);
    const aoiro = readFileSync(
      join(getDocsDir(), "finance/blue-return/2026/aoiro-kessansho.md"),
      "utf-8",
    );
    expect(aoiro).toContain("家事・事業按分");
    const hojobo = readFileSync(
      join(getDocsDir(), "finance/blue-return/2026/hojobo.md"),
      "utf-8",
    );
    expect(hojobo).toMatch(/60/);
  });

  it("raises cap to 650k when filing has etax evidence after books", () => {
    writeFileSync(
      financePath("blue-return-filing.yaml"),
      `version: 1
calendar_year: 2026
etax_submitted_at: "2027-03-10T12:00:00+09:00"
`,
      "utf-8",
    );
    writeBooksPack(YEAR);
    const draft = buildFormBDraft(YEAR);
    expect(draft.deduction_gate.eligible_cap_yen).toBe(BLUE_RETURN_DEDUCTION_65);
    expect(draft.blue_deduction_yen).toBe(BLUE_RETURN_DEDUCTION_65);
  });
});
