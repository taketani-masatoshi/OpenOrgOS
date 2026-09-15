import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildFormBDraft,
  sumCappedIncomeDeductions,
} from "../src/lib/finance/sole-proprietor-blue-return.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import type { BlueReturnIncomeDeductions } from "../schemas/finance/blue-return-income-deductions.js";

describe("Form B income deductions", () => {
  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
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
      join(getTenantDir(), "data/finance/blue-return-income-deductions.yaml"),
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
      join(getTenantDir(), "data/finance/blue-return-income-deductions.yaml"),
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
    // restore empty
    writeFileSync(
      join(getTenantDir(), "data/finance/blue-return-income-deductions.yaml"),
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
  });
});
