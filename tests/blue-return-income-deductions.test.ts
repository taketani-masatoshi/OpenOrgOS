import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildFormBDraft,
  loadBlueReturnIncomeDeductions,
  sumCappedIncomeDeductions,
} from "../src/lib/finance/sole-proprietor-blue-return.js";
import { resolveSolePropCalendarYear } from "../src/lib/finance/sole-prop-year.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import type { BlueReturnIncomeDeductions } from "../schemas/finance/blue-return-income-deductions.js";

const DEDUCTIONS_REL = "data/finance/blue-return-income-deductions.yaml";

describe("Form B income deductions", () => {
  let originalDeductions: string | null = null;

  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
    const path = join(getTenantDir(), DEDUCTIONS_REL);
    try {
      originalDeductions = readFileSync(path, "utf-8");
    } catch {
      originalDeductions = null;
    }
  });

  afterEach(() => {
    const path = join(getTenantDir(), DEDUCTIONS_REL);
    if (originalDeductions != null) {
      writeFileSync(path, originalDeductions, "utf-8");
    }
  });

  it("caps life and earthquake insurance", () => {
    const d: BlueReturnIncomeDeductions = {
      version: 1,
      calendar_year: 2026,
      social_insurance_yen: 100_000,
      life_insurance_yen: 500_000,
      earthquake_insurance_yen: 80_000,
      spouse_special_yen: 0,
      dependents_yen: 0,
      small_enterprise_mutual_yen: 0,
    };
    const capped = sumCappedIncomeDeductions(d);
    expect(capped.total).toBe(100_000 + 120_000 + 50_000);
  });

  it("lowers taxable income when social insurance is set", () => {
    writeFileSync(
      join(getTenantDir(), DEDUCTIONS_REL),
      `version: 1
calendar_year: 2026
social_insurance_yen: 0
life_insurance_yen: 0
earthquake_insurance_yen: 0
spouse_special_yen: 0
dependents_yen: 0
small_enterprise_mutual_yen: 0
`,
      "utf-8",
    );
    const base = buildFormBDraft(2026);
    writeFileSync(
      join(getTenantDir(), DEDUCTIONS_REL),
      `version: 1
calendar_year: 2026
social_insurance_yen: 200000
life_insurance_yen: 0
earthquake_insurance_yen: 0
spouse_special_yen: 0
dependents_yen: 0
small_enterprise_mutual_yen: 0
`,
      "utf-8",
    );
    const withSi = buildFormBDraft(2026);
    expect(withSi.income_deductions_yen).toBe(200_000);
    expect(withSi.taxable_income_yen).toBeLessThanOrEqual(base.taxable_income_yen);
  });

  it("year mismatch returns null deductions and does not lower Form B tax", () => {
    writeFileSync(
      join(getTenantDir(), DEDUCTIONS_REL),
      `version: 1
calendar_year: 2025
social_insurance_yen: 500000
life_insurance_yen: 0
earthquake_insurance_yen: 0
spouse_special_yen: 0
dependents_yen: 0
small_enterprise_mutual_yen: 0
`,
      "utf-8",
    );
    const loaded = loadBlueReturnIncomeDeductions(2026);
    expect(loaded.missing).toBe(true);
    expect(loaded.deductions).toBeNull();

    const draft = buildFormBDraft(2026);
    expect(draft.income_deductions_missing).toBe(true);
    expect(draft.income_deductions_yen).toBe(0);
  });
});

describe("resolveSolePropCalendarYear", () => {
  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
  });

  it("prefers explicit year over setup and clock", () => {
    expect(
      resolveSolePropCalendarYear({
        explicit: 2024,
        clock: new Date("2030-06-01T00:00:00Z"),
      }),
    ).toBe(2024);
  });

  it("uses setup.calendar_year when explicit omitted", () => {
    const year = resolveSolePropCalendarYear({
      clock: new Date("2030-06-01T00:00:00Z"),
    });
    // fixture setup is 2026
    expect(year).toBe(2026);
  });
});
