// @catalog-ids: jp_labor_contract
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LaborContract,
  LaborWage,
  MinimumWagesFile,
} from "../../schemas/jp-labor-contract.js";
import { laborAsOfDate, laborContractSchema } from "../../schemas/jp-labor-contract.js";
import { setTenantId } from "../../src/lib/tenant.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { describeModuleCliRegistrations, listModuleCliBundles } from "../../src/lib/module-cli.js";
import { loadSkillRegistry, validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import {
  assessFixedTermLength,
  assessMinimumWage,
  assessNonRenewalNotice,
  buildContractCheck,
  buildConversionReport,
  buildDraft,
  conversionRightArisesWithin,
  coolingThresholdMonths,
  currentSegment,
  exceedsConversionThreshold,
  findLaborDataIssues,
  isCoolingGap,
  normalizePeriods,
  periodLength,
  requiredDisclosures,
  runJpLaborContractCheck,
  runJpLaborContractConversionCheck,
  runJpLaborContractDraft,
  runJpLaborContractShow,
  runJpLaborContractValidate,
  sumPeriodLengths,
} from "../../steward/jurisdiction-packs/JP/modules/jp_labor_contract/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_labor_contract";

describeCatalogModule(MODULE_ID);

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as T;
}

function statusOf(
  checks: ReadonlyArray<{ id: string; status: string }>,
  id: string
): string | undefined {
  return checks.find((check) => check.id === id)?.status;
}

const TOKYO_TABLE: MinimumWagesFile = {
  fiscal_year_label: "令和7年度",
  source_url:
    "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/",
  retrieved_on: "2026-09-24",
  verified_through: "2026-09-30",
  rates: [{ prefecture: "東京都", hourly_yen: 1226, effective_from: "2025-10-03" }],
};

function hourlyWage(amount: number): LaborWage {
  return { unit: "hourly", base_amount: amount, minimum_wage_eligible_allowances: 0 };
}

function tokyoWageCheck(wage: LaborWage, onDate = "2026-09-24"): string {
  return assessMinimumWage({ wage, prefecture: "東京都", onDate, table: TOKYO_TABLE }).status;
}

function fixedTermLength(
  endDate: string,
  extra: { ageAtConclusion?: number; termBasis?: LaborContract["term_basis"] } = {}
) {
  return assessFixedTermLength({
    contractType: "fixed_term",
    startDate: "2026-04-01",
    endDate,
    termBasis: extra.termBasis ?? "standard",
    ageAtConclusion: extra.ageAtConclusion,
  }).status;
}

function sampleContract(overrides: Partial<LaborContract>): LaborContract {
  return laborContractSchema.parse({
    id: "LC-TEST",
    employee_id: "E-TEST",
    contract_type: "fixed_term",
    part_time: true,
    concluded_on: "2024-04-01",
    start_date: "2024-04-01",
    end_date: "2025-03-31",
    renewal: "may_renew",
    workplace_prefecture: "東京都",
    wage: hourlyWage(1300),
    ...overrides,
  });
}

describe("jp_labor_contract — 日付", () => {
  it("accepts calendar dates only", () => {
    expect(laborAsOfDate.safeParse("2026-02-28").success).toBe(true);
    expect(laborAsOfDate.safeParse("2026-02-29").success).toBe(false);
    expect(laborAsOfDate.safeParse("2026-13-01").success).toBe(false);
  });
});

describe("jp_labor_contract — 労基法14条 契約期間の上限", () => {
  it("allows exactly 3 years and rejects 3 years + 1 day", () => {
    expect(fixedTermLength("2029-03-31", { ageAtConclusion: 45 })).toBe("ok");
    expect(fixedTermLength("2029-04-01", { ageAtConclusion: 45 })).toBe("ng");
  });

  it("applies the 5-year limit from age 60 at conclusion", () => {
    expect(fixedTermLength("2031-03-31", { ageAtConclusion: 59 })).toBe("ng");
    expect(fixedTermLength("2031-03-31", { ageAtConclusion: 60 })).toBe("ok");
    expect(fixedTermLength("2031-04-01", { ageAtConclusion: 60 })).toBe("ng");
  });

  it("routes special bases and unknown age to needs_review", () => {
    expect(fixedTermLength("2030-03-31", { termBasis: "advanced_professional" })).toBe(
      "needs_review"
    );
    expect(fixedTermLength("2031-03-31", { termBasis: "project_completion" })).toBe("needs_review");
    expect(fixedTermLength("2030-03-31")).toBe("needs_review");
  });
});

describe("jp_labor_contract — 最低賃金（時間額換算）", () => {
  it("compares hourly wage at the statutory boundary", () => {
    expect(tokyoWageCheck(hourlyWage(1225))).toBe("ng");
    expect(tokyoWageCheck(hourlyWage(1226))).toBe("ok");
    expect(tokyoWageCheck(hourlyWage(1227))).toBe("ok");
  });

  it("converts monthly wage by average scheduled hours including eligible allowances", () => {
    const monthly = (base: number, allowances = 0): LaborWage => ({
      unit: "monthly",
      base_amount: base,
      minimum_wage_eligible_allowances: allowances,
      monthly_average_scheduled_hours: 160,
    });
    expect(tokyoWageCheck(monthly(196_159))).toBe("ng");
    expect(tokyoWageCheck(monthly(196_160))).toBe("ok");
    expect(tokyoWageCheck(monthly(186_160, 10_000))).toBe("ok");
  });

  it("needs review when the table cannot answer", () => {
    expect(tokyoWageCheck(hourlyWage(1500), "2025-10-02")).toBe("needs_review");
    expect(tokyoWageCheck(hourlyWage(1500), "2026-10-01")).toBe("needs_review");
    expect(
      tokyoWageCheck({ unit: "piece_rate", base_amount: 0, minimum_wage_eligible_allowances: 0 })
    ).toBe("needs_review");
    expect(
      tokyoWageCheck({ unit: "daily", base_amount: 10_000, minimum_wage_eligible_allowances: 0 })
    ).toBe("needs_review");
    const osaka = assessMinimumWage({
      wage: hourlyWage(1500),
      prefecture: "大阪府",
      onDate: "2026-09-24",
      table: TOKYO_TABLE,
    });
    expect(osaka.status).toBe("needs_review");
  });
});

describe("jp_labor_contract — 労契法18条 通算契約期間とクーリング", () => {
  it("measures calendar months and sums leftover days at 30 days per month", () => {
    expect(periodLength("2021-10-01", "2026-09-30")).toEqual({ months: 60, days: 0 });
    expect(
      sumPeriodLengths([
        { months: 0, days: 20 },
        { months: 0, days: 15 },
      ])
    ).toEqual({ months: 1, days: 5 });
  });

  it("derives the cooling period from half of the prior cumulative term, capped at 6 months", () => {
    expect(coolingThresholdMonths({ months: 5, days: 0 })).toBe(3);
    expect(coolingThresholdMonths({ months: 5, days: 15 })).toBe(3);
    expect(coolingThresholdMonths({ months: 6, days: 1 })).toBe(4);
    expect(coolingThresholdMonths({ months: 11, days: 0 })).toBe(6);
    expect(coolingThresholdMonths({ months: 24, days: 0 })).toBe(6);
  });

  it("resets only when the gap reaches the cooling period", () => {
    const oneYear = { months: 12, days: 0 };
    expect(isCoolingGap("2025-03-31", "2025-10-01", oneYear)).toBe(true);
    expect(isCoolingGap("2025-03-31", "2025-09-30", oneYear)).toBe(false);
    const sixMonths = { months: 6, days: 0 };
    expect(isCoolingGap("2024-09-30", "2025-01-01", sixMonths)).toBe(true);
    expect(isCoolingGap("2024-09-30", "2024-12-31", sixMonths)).toBe(false);
  });

  it("grants the conversion right only when the cumulative term exceeds 5 years", () => {
    expect(exceedsConversionThreshold({ months: 59, days: 29 })).toBe(false);
    expect(exceedsConversionThreshold({ months: 60, days: 0 })).toBe(false);
    expect(exceedsConversionThreshold({ months: 60, days: 1 })).toBe(true);
  });

  it("detects the renewal on which the application right arises", () => {
    const history = [2021, 2022, 2023, 2024, 2025].map((year) => ({
      start_date: `${year}-10-01`,
      end_date: `${year + 1}-09-30`,
    }));
    expect(conversionRightArisesWithin(history.slice(0, 4), history[4])).toBe(false);
    expect(
      conversionRightArisesWithin(history, { start_date: "2026-10-01", end_date: "2027-09-30" })
    ).toBe(true);
  });

  it("excludes contracts starting before 2013-04-01 and resets after cooling", () => {
    const periods = normalizePeriods([
      { start_date: "2012-04-01", end_date: "2013-03-31" },
      { start_date: "2024-04-01", end_date: "2024-09-30" },
      { start_date: "2025-01-01", end_date: "2025-12-31" },
    ]).periods;
    expect(periods).toHaveLength(2);
    expect(currentSegment(periods).cumulative).toEqual({ months: 12, days: 0 });
  });
});

describe("jp_labor_contract — 雇止め予告（告示2条）", () => {
  const quarterly = [
    { start_date: "2025-04-01", end_date: "2025-07-31" },
    { start_date: "2025-08-01", end_date: "2025-11-30" },
    { start_date: "2025-12-01", end_date: "2026-03-31" },
  ];

  it("is not required at 2 renewals with exactly 1 year of service", () => {
    expect(assessNonRenewalNotice(currentSegment(quarterly), false).required).toBe(false);
  });

  it("is required from the 3rd renewal with a deadline 30 days before expiry", () => {
    const notice = assessNonRenewalNotice(
      currentSegment([...quarterly, { start_date: "2026-04-01", end_date: "2026-04-30" }]),
      false
    );
    expect(notice.required).toBe(true);
    expect(notice.renewals).toBe(3);
    expect(notice.deadline).toBe("2026-03-31");
  });

  it("is required once service exceeds 1 year and waived when non-renewal was specified", () => {
    const single = currentSegment([{ start_date: "2025-04-01", end_date: "2026-04-01" }]);
    expect(assessNonRenewalNotice(single, false).required).toBe(true);
    expect(assessNonRenewalNotice(single, true).required).toBe(false);
  });
});

describe("jp_labor_contract — 明示事項（労基則5条 · パート有期法6条）", () => {
  const keys = (contract: LaborContract) =>
    requiredDisclosures(contract).map((requirement) => requirement.key);

  it("requires change scope and renewal cap from 2024-04-01", () => {
    const before = keys(sampleContract({ concluded_on: "2024-03-31", start_date: "2024-04-01" }));
    const after = keys(sampleContract({ concluded_on: "2024-04-01" }));
    expect(before).not.toContain("workplace_change_scope");
    expect(before).not.toContain("renewal_cap");
    expect(after).toEqual(
      expect.arrayContaining(["workplace_change_scope", "duties_change_scope", "renewal_cap"])
    );
  });

  it("requires the treatment-explanation notice for part-time/fixed-term hires from 2026-10-01", () => {
    const before = sampleContract({
      concluded_on: "2026-09-15",
      start_date: "2026-09-30",
      end_date: "2027-03-31",
    });
    const after = sampleContract({
      concluded_on: "2026-09-15",
      start_date: "2026-10-01",
      end_date: "2027-03-31",
    });
    expect(keys(before)).not.toContain("treatment_explanation_right");
    expect(keys(after)).toContain("treatment_explanation_right");
    expect(keys(after)).toEqual(
      expect.arrayContaining(["pay_raise", "retirement_allowance", "bonus", "consultation_desk"])
    );
  });
});

describe("jp_labor_contract — validate integrity rules", () => {
  it("lists duplicate ids, inconsistent periods, unknown prefectures, missing hours, and overlaps", () => {
    const issues = findLaborDataIssues({
      contracts: [
        sampleContract({ id: "LC-DUP", end_date: undefined }),
        sampleContract({ id: "LC-DUP", workplace_prefecture: "東京" }),
        sampleContract({
          id: "LC-DAILY",
          employee_id: "E-2",
          wage: { unit: "daily", base_amount: 9000, minimum_wage_eligible_allowances: 0 },
        }),
      ],
      history: [{ employee_id: "E-2", start_date: "2024-06-01", end_date: "2024-12-31" }],
      minimumWages: TOKYO_TABLE,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        "duplicate contract id: LC-DUP",
        "LC-DUP: fixed_term requires end_date",
        "LC-DUP: unknown workplace_prefecture 東京",
        "LC-DAILY: wage.unit daily requires scheduled hours",
        "E-2: overlapping fixed-term periods",
      ])
    );
  });
});

describe("jp_labor_contract module on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("has manifest, CLI registration, and valid skills", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(listModuleCliBundles().map((bundle) => bundle.moduleId)).toContain(MODULE_ID);
    const registration = describeModuleCliRegistrations().get(MODULE_ID);
    expect(registration?.rootPath).toEqual(["operations", "labor-contract"]);
    expect([...(registration?.subcommands ?? [])].sort()).toEqual(
      [...(manifest?.cli_commands ?? [])].sort()
    );
    expect(validateSkillRegistryFiles()).toEqual([]);
    const skillIds = loadSkillRegistry()
      .filter((skill) => skill.moduleId === MODULE_ID)
      .map((skill) => skill.id);
    expect(skillIds).toEqual(
      expect.arrayContaining(["jp_employment_contract_draft", "jp_fixed_term_conversion_check"])
    );
  });

  it("show summarizes seed contracts without wage amounts", () => {
    const summary = captureJson<{
      jurisdiction: string;
      contracts: number;
      minimum_wage_rates: number;
      contracts_list: object[];
    }>(() => runJpLaborContractShow({ json: true }));
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.contracts).toBe(7);
    expect(summary.minimum_wage_rates).toBe(47);
    expect(JSON.stringify(summary.contracts_list)).not.toContain("base_amount");
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpLaborContractValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_labor_contract — labor contract data OK");
    spy.mockRestore();
  });

  it("check passes the complete indefinite contract", () => {
    const result = captureJson<{ passed: boolean; checks: Array<{ id: string; status: string }> }>(
      () => runJpLaborContractCheck({ contract: "LC-2026-001", asOf: "2026-09-24", json: true })
    );
    expect(result.passed).toBe(true);
    expect(statusOf(result.checks, "req-jp")).toBe("ok");
    expect(statusOf(result.checks, "minimum-wage")).toBe("ok");
  });

  it("check detects minimum wage shortfall and missing change scope", () => {
    const result = buildContractCheck("LC-2026-002", "2026-09-24");
    expect(result.status).toBe("ng");
    expect(statusOf(result.checks, "minimum-wage")).toBe("ng");
    expect(statusOf(result.checks, "disclosure-workplace_change_scope")).toBe("ng");
    expect(JSON.stringify(result)).not.toContain("1150");
  });

  it("check detects term, renewal-cap, and review findings", () => {
    expect(
      statusOf(buildContractCheck("LC-2026-003", "2026-09-24").checks, "fixed-term-max-length")
    ).toBe("ng");
    expect(
      statusOf(buildContractCheck("LC-2026-006", "2026-09-24").checks, "renewal-cap-explanation")
    ).toBe("ng");
    const professional = buildContractCheck("LC-2026-007", "2026-09-24");
    expect(professional.status).toBe("needs_review");
    expect(statusOf(professional.checks, "probation")).toBe("needs_review");
  });

  it("check requires conversion disclosures on the renewal that crosses 5 years", () => {
    const renewal = buildContractCheck("LC-2026-005", "2026-09-24");
    expect(statusOf(renewal.checks, "disclosure-conversion_application")).toBe("ok");
    expect(statusOf(renewal.checks, "disclosure-treatment_explanation_right")).toBe("ok");
    expect(statusOf(renewal.checks, "minimum-wage")).toBe("needs_review");
    const current = buildContractCheck("LC-2025-004", "2026-09-24");
    expect(statusOf(current.checks, "disclosure-conversion_application")).toBeUndefined();
  });

  it("conversion-check flags the next-renewal right and an overdue notice", () => {
    const report = captureJson<ReturnType<typeof buildConversionReport>>(() =>
      runJpLaborContractConversionCheck({ asOf: "2026-09-24", json: true })
    );
    const byId = new Map(report.employees.map((employee) => [employee.employee_id, employee]));
    expect(report.jurisdiction_check.status).toBe("ok");
    expect(byId.get("E-1004")?.conversion_right_now).toBe(false);
    expect(byId.get("E-1004")?.conversion_right_at_next_renewal).toBe(true);
    expect(byId.get("E-1004")?.cumulative_months).toBe(60);
    expect(byId.get("E-1005")?.non_renewal_notice?.deadline).toBe("2026-09-15");
    expect(byId.get("E-1005")?.alerts.join()).toContain("経過");
    expect(byId.get("E-1005")?.status).toBe("needs_review");
    expect(byId.get("E-1003")?.non_renewal_notice?.required).toBe(false);
    expect(byId.get("E-1002")?.cumulative_months).toBe(24);
  });

  it("draft renders the notice without wage amounts and lists missing items", () => {
    const meta = captureJson<{ written: boolean; output: string; missing_items: string[] }>(() =>
      runJpLaborContractDraft({ contract: "LC-2026-002", json: true })
    );
    expect(meta.written).toBe(false);
    expect(meta.output).toContain("docs/company/hr/labor-contracts/LC-2026-002");
    expect(meta.missing_items).toContain("workplace_change_scope");
    const draft = buildDraft("LC-2026-005", false);
    expect(draft.content).toContain("無期転換申込みに関する事項: 本契約期間中");
    expect(draft.content).toContain("（金額は L2");
    expect(draft.content).not.toContain("235000");
    expect(draft.content).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe("jp_labor_contract non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("check fails the jurisdiction rule on hk-demo", () => {
    const result = buildContractCheck("LC-2026-001", "2026-09-24");
    expect(result.passed).toBe(false);
    expect(statusOf(result.checks, "req-jp")).toBe("ng");
  });

  it("conversion-check fails the jurisdiction rule on hk-demo", () => {
    const report = buildConversionReport("2026-09-24");
    expect(report.passed).toBe(false);
    expect(report.jurisdiction_check.status).toBe("ng");
  });

  it("validate exits with req-jp on hk-demo", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => runJpLaborContractValidate()).toThrow("exit 1");
    expect(errors.join("\n")).toContain("req-jp");
    vi.restoreAllMocks();
  });
});
