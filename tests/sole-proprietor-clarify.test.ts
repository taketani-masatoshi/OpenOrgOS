import { describe, expect, it } from "vitest";
import {
  assessBlueReturnSetup,
  assessExpenseIntake,
  classifyAmountBand,
} from "../src/lib/finance/sole-proprietor-clarify.js";
import type { BlueReturnSetup } from "../schemas/finance/blue-return-setup.js";
import type { BlueReturnExpenseIntake } from "../schemas/finance/blue-return-expense-intake.js";
import { setTenantId } from "../src/lib/tenant.js";

const completeSetup = (): BlueReturnSetup => ({
  version: 1,
  calendar_year: 2025,
  opened_on: "2025-01-01",
  blue_return_approved: true,
  books_start_month: "2025-01",
  deduction_target: "650000",
  deduction_path: "etax",
  consumption: {
    status: "課税事業者（本則）",
    method: "standard",
    invoice_registered: false,
  },
  home_office: {
    has_home_office: false,
    allocation_method: "n_a",
  },
  accounts_separated: true,
  has_blue_special_family_employees: false,
  depreciation_policy: "immediate_under_100k",
  has_withholding_outsourcing: true,
  tax_advisor_handoff: {
    deadline: "2026-03-16",
    owner: "owner",
  },
});

describe("classifyAmountBand", () => {
  it("splits at 100k / 200k / 300k", () => {
    expect(classifyAmountBand(99_999)).toBe("under_100k");
    expect(classifyAmountBand(100_000)).toBe("from_100k_to_200k");
    expect(classifyAmountBand(199_999)).toBe("from_100k_to_200k");
    expect(classifyAmountBand(200_000)).toBe("from_200k_to_300k");
    expect(classifyAmountBand(300_000)).toBe("from_300k");
  });
});

describe("assessBlueReturnSetup", () => {
  it("asks for setup file when missing", () => {
    const a = assessBlueReturnSetup(null);
    expect(a.ready).toBe(false);
    expect(a.file_missing).toBe(true);
    expect(a.clarify_questions.some((q) => q.id === "setup_file")).toBe(true);
  });

  it("lists gaps when fields empty", () => {
    const a = assessBlueReturnSetup({ version: 1, calendar_year: 2025 });
    expect(a.ready).toBe(false);
    expect(a.missing).toContain("opened_on");
    expect(a.missing).toContain("deduction_target");
    expect(a.missing).toContain("depreciation_policy");
    expect(a.clarify_questions.length).toBeGreaterThanOrEqual(8);
  });

  it("is ready when all required fields filled", () => {
    const a = assessBlueReturnSetup(completeSetup());
    expect(a.ready).toBe(true);
    expect(a.clarify_questions).toEqual([]);
    // optional_questions must not keep ready false
    expect(a.missing).not.toContain("income_deductions_yaml");
  });

  it("offers income deductions YAML as optional without lowering ready", () => {
    setTenantId("_fixture-sole-prop");
    // Fixture deductions are CY2026; setup year 2025 → year mismatch → optional
    const setup = completeSetup();
    setup.calendar_year = 2025;
    const a = assessBlueReturnSetup(setup);
    expect(a.ready).toBe(true);
    expect(a.optional_questions.some((q) => q.id === "income_deductions_yaml")).toBe(true);
    expect(a.missing).not.toContain("income_deductions_yaml");
  });

  it("requires deduction_path when targeting 650k", () => {
    const setup = completeSetup();
    setup.deduction_path = "unset";
    const a = assessBlueReturnSetup(setup);
    expect(a.ready).toBe(false);
    expect(a.missing).toContain("deduction_path");
  });
});

describe("assessExpenseIntake", () => {
  it("asks many questions for bare amount", () => {
    const a = assessExpenseIntake({ amount_yen: 150_000 }, completeSetup());
    expect(a.amount_band).toBe("from_100k_to_200k");
    expect(a.complete).toBe(false);
    expect(a.missing).toContain("business_use");
    expect(a.missing).toContain("depreciation_choice");
    expect(a.clarify_questions.some((q) => q.id === "depreciation_choice")).toBe(true);
  });

  it("requires business_pct when shared", () => {
    const a = assessExpenseIntake(
      {
        amount_yen: 10_000,
        business_use: "shared",
        depreciation_choice: "expense",
        occurred_on: "2025-01-31",
        paid_on: "2025-01-31",
        expense_line: "通信費",
        evidence_refs: ["x"],
        invoice_qualified: false,
        withholding_applicable: false,
        bundle_or_split_purchase: false,
        repair_vs_capex: "repair",
        timing: "current_expense",
      },
      completeSetup(),
    );
    expect(a.missing).toContain("business_pct");
    expect(a.missing).toContain("owner_draw_split_done");
    expect(a.missing).toContain("allocation_write_mode");
  });

  it("flags expense choice in 100-200k band without immediate policy match", () => {
    const setup = completeSetup();
    setup.depreciation_policy = "ordinary";
    const a = assessExpenseIntake(
      {
        amount_yen: 150_000,
        business_use: "business_only",
        depreciation_choice: "expense",
        occurred_on: "2025-03-01",
        paid_on: "2025-03-01",
        expense_line: "消耗品費",
        evidence_refs: ["x"],
        invoice_qualified: false,
        withholding_applicable: false,
        bundle_or_split_purchase: false,
        repair_vs_capex: "repair",
        timing: "current_expense",
      },
      setup,
    );
    expect(a.complete).toBe(false);
    expect(a.clarify_questions.some((q) => q.id === "depreciation_choice")).toBe(true);
  });

  it("is complete for a filled under-100k expense", () => {
    const intake: Partial<BlueReturnExpenseIntake> & { amount_yen: number } = {
      amount_yen: 19_800,
      business_use: "business_only",
      depreciation_choice: "expense",
      occurred_on: "2025-02-01",
      paid_on: "2025-02-10",
      expense_line: "消耗品費",
      account_code: "5200",
      evidence_refs: ["source:card"],
      invoice_qualified: false,
      withholding_applicable: false,
      bundle_or_split_purchase: false,
      repair_vs_capex: "repair",
      timing: "current_expense",
    };
    const a = assessExpenseIntake(intake, completeSetup());
    expect(a.amount_band).toBe("under_100k");
    expect(a.complete).toBe(true);
    expect(a.clarify_questions).toEqual([]);
  });
});
