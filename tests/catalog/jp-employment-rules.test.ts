// @catalog-ids: jp_employment_rules
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OvertimeAgreement, OvertimeRecord } from "../../schemas/jp-employment-rules.js";
import { setTenantId } from "../../src/lib/tenant.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { describeModuleCliRegistrations, listModuleCliBundles } from "../../src/lib/module-cli.js";
import {
  allowedMonthsOverLimit,
  effectiveAnnualCap,
  evaluateEmployeeOvertime,
  evaluateLaborParty,
  exceedsMonthlyTotalCap,
  generalLimitViolations,
  isWorkRulesRequired,
  missingAbsoluteItems,
  missingRelativeItems,
  monthsOverAgreedLimit,
  periodMonthsUpTo,
  rollingAverageFindings,
  runJpAgreementCheck,
  runJpOvertimeCheck,
  runJpWorkRulesCheck,
  runJpWorkRulesDraft,
  runJpWorkRulesShow,
  runJpWorkRulesValidate,
  specialClauseLimitViolations,
  statutoryLimits,
  validityCheck,
  type CheckReport,
} from "../../steward/jurisdiction-packs/JP/modules/jp_employment_rules/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_employment_rules";

describeCatalogModule(MODULE_ID);

function agreementFixture(overrides: Partial<OvertimeAgreement> = {}): OvertimeAgreement {
  return {
    id: "AGR-TEST",
    workplace_id: "WP-TEST",
    work_category: "general",
    variable_hours_over_3_months: false,
    covered_workers: "全従業員",
    extension_reasons: ["繁忙"],
    period_start: "2026-04-01",
    effective_from: "2026-04-01",
    effective_to: "2027-03-31",
    filed_on: "2026-03-20",
    party: { type: "majority_union", union_name: "テスト労組" },
    general: { daily_hours: 4, monthly_hours: 45, annual_hours: 360 },
    special_clause: {
      monthly_total_hours: 80,
      annual_overtime_hours: 600,
      max_months_over_limit: 6,
      circumstances: ["決算"],
      health_measures: ["面接指導"],
      premium_rate_percent: 25,
      procedure: "協議",
    },
    confirms_statutory_caps: true,
    notification: { method: "posting", notified_on: "2026-04-01" },
    ...overrides,
  };
}

type Special = NonNullable<OvertimeAgreement["special_clause"]>;

function special(overrides: Partial<Special>): Special {
  return { ...agreementFixture().special_clause!, ...overrides };
}

function month(label: string, overtime: number, holiday = 0) {
  return { month: label, overtime_hours: overtime, holiday_work_hours: holiday };
}

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    run();
    return JSON.parse(String(spy.mock.calls[0]?.[0])) as T;
  } finally {
    spy.mockRestore();
  }
}

function subject(report: CheckReport, id: string) {
  const found = report.results.find((r) => r.subject_id === id);
  if (!found) throw new Error(`subject ${id} missing`);
  return found;
}

function checkStatus(report: CheckReport, subjectId: string, checkId: string): string | undefined {
  return subject(report, subjectId).checks.find((c) => c.id === checkId)?.status;
}

describe("jp_employment_rules — 労基法89条 就業規則", () => {
  it("作成義務は常時10人以上（9 / 10 / 11）", () => {
    expect(isWorkRulesRequired(9)).toBe(false);
    expect(isWorkRulesRequired(10)).toBe(true);
    expect(isWorkRulesRequired(11)).toBe(true);
  });

  it("交替制の就業時転換は交替制がある場合のみ必要", () => {
    const base = [
      "start_end_time",
      "break_time",
      "holidays",
      "leave",
      "wage_determination",
      "wage_calculation_payment",
      "wage_cutoff_payment_date",
      "wage_raise",
      "retirement_including_dismissal",
    ] as const;
    expect(missingAbsoluteItems(base, false)).toEqual([]);
    expect(missingAbsoluteItems(base, true)).toEqual(["shift_rotation"]);
    expect(missingAbsoluteItems(base.slice(1), false)).toEqual(["start_end_time"]);
  });

  it("相対的必要記載事項は制度がある場合に記載が必要", () => {
    expect(missingRelativeItems([], [])).toEqual([]);
    expect(missingRelativeItems(["retirement_allowance"], ["retirement_allowance"])).toEqual([]);
    expect(missingRelativeItems([], ["retirement_allowance"])).toEqual(["retirement_allowance"]);
  });

  it("過半数代表者の要件（施行規則6条の2）", () => {
    const rep = { type: "majority_representative" as const, representative_employee_id: "EMP-001", selection_method: "vote" as const };
    expect(evaluateLaborParty({ ...rep, representative_is_manager: false }, "overtime_agreement").status).toBe("ok");
    expect(evaluateLaborParty({ ...rep, selection_method: "employer_appointed" }, "overtime_agreement").status).toBe("violation");
    expect(evaluateLaborParty({ ...rep, representative_is_manager: true }, "overtime_agreement").status).toBe("violation");
    expect(evaluateLaborParty({ ...rep, representative_is_manager: true }, "work_rules_opinion").status).toBe("needs_review");
    expect(evaluateLaborParty(rep, "overtime_agreement").status).toBe("needs_review");
  });
});

describe("jp_employment_rules — 労基法36条 協定内容", () => {
  it("限度時間 月45h・年360h（境界）", () => {
    const limits = statutoryLimits(false);
    expect(generalLimitViolations({ monthly_hours: 44, annual_hours: 359 }, limits)).toEqual([]);
    expect(generalLimitViolations({ monthly_hours: 45, annual_hours: 360 }, limits)).toEqual([]);
    expect(generalLimitViolations({ monthly_hours: 46, annual_hours: 361 }, limits)).toHaveLength(2);
  });

  it("1年単位変形（3か月超）は月42h・年320h（境界）", () => {
    const limits = statutoryLimits(true);
    expect(generalLimitViolations({ monthly_hours: 41, annual_hours: 319 }, limits)).toEqual([]);
    expect(generalLimitViolations({ monthly_hours: 42, annual_hours: 320 }, limits)).toEqual([]);
    expect(generalLimitViolations({ monthly_hours: 43, annual_hours: 321 }, limits)).toHaveLength(2);
  });

  it("特別条項 月100h未満（99 / 100 / 101）", () => {
    expect(specialClauseLimitViolations(special({ monthly_total_hours: 99 }), "general")).toEqual([]);
    expect(specialClauseLimitViolations(special({ monthly_total_hours: 100 }), "general")).toHaveLength(1);
    expect(specialClauseLimitViolations(special({ monthly_total_hours: 101 }), "general")).toHaveLength(1);
  });

  it("特別条項 年720h以内（719 / 720 / 721）· 月数6以内（5 / 6 / 7）", () => {
    expect(specialClauseLimitViolations(special({ annual_overtime_hours: 719 }), "general")).toEqual([]);
    expect(specialClauseLimitViolations(special({ annual_overtime_hours: 720 }), "general")).toEqual([]);
    expect(specialClauseLimitViolations(special({ annual_overtime_hours: 721 }), "general")).toHaveLength(1);
    expect(specialClauseLimitViolations(special({ max_months_over_limit: 5 }), "general")).toEqual([]);
    expect(specialClauseLimitViolations(special({ max_months_over_limit: 6 }), "general")).toEqual([]);
    expect(specialClauseLimitViolations(special({ max_months_over_limit: 7 }), "general")).toHaveLength(1);
  });

  it("自動車運転業務は年960h（959 / 960 / 961）· 月100h・月数は不適用", () => {
    const driving = (annual: number) =>
      specialClauseLimitViolations(special({ annual_overtime_hours: annual, monthly_total_hours: 120, max_months_over_limit: 12 }), "motor_vehicle_driving");
    expect(driving(959)).toEqual([]);
    expect(driving(960)).toEqual([]);
    expect(driving(961)).toHaveLength(1);
  });

  it("災害復旧は月100h不適用だが年720h・月数は適用", () => {
    expect(specialClauseLimitViolations(special({ monthly_total_hours: 120 }), "construction_disaster_recovery")).toEqual([]);
    expect(specialClauseLimitViolations(special({ annual_overtime_hours: 721 }), "construction_disaster_recovery")).toHaveLength(1);
  });

  it("有効期限アラート（残り31 / 30 / 失効 · 後継あり）", () => {
    const agreement = agreementFixture({ effective_to: "2026-10-31" });
    expect(validityCheck(agreement, "2026-09-30", false).status).toBe("ok");
    expect(validityCheck(agreement, "2026-10-01", false).status).toBe("alert");
    expect(validityCheck(agreement, "2026-11-01", false).status).toBe("violation");
    expect(validityCheck(agreement, "2026-11-01", true).status).toBe("ok");
    expect(validityCheck(agreement, "2026-03-01", false).status).toBe("ok");
  });
});

describe("jp_employment_rules — 労基法36条6項 実績", () => {
  it("月の時間外＋休日 100h未満（99 / 100 / 101）", () => {
    expect(exceedsMonthlyTotalCap(month("2026-04", 90, 9))).toBe(false);
    expect(exceedsMonthlyTotalCap(month("2026-04", 90, 10))).toBe(true);
    expect(exceedsMonthlyTotalCap(month("2026-04", 90, 11))).toBe(true);
  });

  it("2か月平均 80h以内（79 / 80 / 81）", () => {
    const evaluate = (second: number) => {
      const byMonth = new Map([
        ["2026-03", month("2026-03", 80)],
        ["2026-04", month("2026-04", second)],
      ]);
      return rollingAverageFindings(byMonth, ["2026-04"]);
    };
    expect(evaluate(78).violations).toEqual([]);
    expect(evaluate(80).violations).toEqual([]);
    expect(evaluate(82).violations).toEqual([{ month: "2026-04", windowMonths: 2, averageHours: 81 }]);
    expect(evaluate(80).missingWindows).toContain("2026-04/3か月");
  });

  it("限度時間超の月数と年上限", () => {
    const months = ["2026-04", "2026-05", "2026-06"].map((m) => month(m, 46));
    expect(monthsOverAgreedLimit([...months, month("2026-07", 45)], 45)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(allowedMonthsOverLimit(agreementFixture({ special_clause: special({ max_months_over_limit: 8 }) }))).toBe(6);
    expect(allowedMonthsOverLimit(agreementFixture({ special_clause: undefined }))).toBe(0);
    expect(effectiveAnnualCap(agreementFixture())).toBe(600);
    expect(effectiveAnnualCap(agreementFixture({ special_clause: undefined }))).toBe(360);
    expect(periodMonthsUpTo("2026-04-01", "2027-06")).toHaveLength(12);
  });

  it("年の時間外が協定の年間上限を超えると違反（600 / 601）", () => {
    const record = (total: number): OvertimeRecord => ({
      employee_id: "EMP-900",
      agreement_id: "AGR-TEST",
      months: [month("2025-11", 0), month("2025-12", 0), month("2026-01", 0), month("2026-02", 0), month("2026-03", 0), month("2026-04", total)],
    });
    const lenient = agreementFixture({ special_clause: special({ monthly_total_hours: 999 }) });
    const annual = (total: number) =>
      evaluateEmployeeOvertime(record(total), lenient, "2026-04").find((c) => c.id === "annual-overtime")?.status;
    expect(annual(600)).toBe("ok");
    expect(annual(601)).toBe("violation");
  });

  it("医師 · 対象期間外は needs_review", () => {
    const record: OvertimeRecord = { employee_id: "EMP-900", agreement_id: "AGR-TEST", months: [month("2026-04", 10)] };
    const physician = evaluateEmployeeOvertime(record, agreementFixture({ work_category: "physician" }), "2026-04");
    expect(physician.map((c) => c.status)).toEqual(["needs_review"]);
    expect(evaluateEmployeeOvertime(record, agreementFixture(), "2027-04")[0]?.status).toBe("needs_review");
  });
});

describe("jp_employment_rules module on demo (seed fallback)", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("has manifest, CLI registration matching cli_commands, and valid skills", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(manifest?.security?.limits?.concurrent_jobs).toBe(1);
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain(MODULE_ID);
    const registration = describeModuleCliRegistrations().get(MODULE_ID);
    expect(registration?.rootPath).toEqual(["operations", "work-rules"]);
    expect([...(registration?.subcommands ?? [])].sort()).toEqual([...(manifest?.cli_commands ?? [])].sort());
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("show and validate load seed data", () => {
    const summary = captureJson<{ jurisdiction: string; workplaces: number; agreements: number }>(() =>
      runJpWorkRulesShow({ json: true })
    );
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.workplaces).toBeGreaterThan(0);
    expect(summary.agreements).toBeGreaterThan(0);

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpWorkRulesValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_employment_rules — work rules and Article 36 agreement data OK");
    spy.mockRestore();
  });

  it("check detects work rules issues per workplace", () => {
    const report = captureJson<CheckReport>(() => runJpWorkRulesCheck({ json: true }));
    expect(report.checks.find((c) => c.id === "req-jp")?.status).toBe("ok");
    expect(subject(report, "WP-HQ").status).toBe("ok");
    expect(checkStatus(report, "WP-OSAKA", "work-rules-filed")).toBe("violation");
    expect(checkStatus(report, "WP-OSAKA", "opinion-attached")).toBe("violation");
    expect(checkStatus(report, "WP-OSAKA", "relative-items")).toBe("violation");
    expect(checkStatus(report, "WP-OSAKA", "notified")).toBe("violation");
    expect(checkStatus(report, "WP-DEPOT", "absolute-items")).toBe("violation");
    expect(checkStatus(report, "WP-DEPOT", "labor-party")).toBe("violation");
    expect(subject(report, "WP-LAB").status).toBe("ok");
    expect(subject(report, "WP-KOBE").status).toBe("needs_review");
    expect(report.status).toBe("violation");
  });

  it("agreement-check detects content limits, late filing, and expiry", () => {
    const report = captureJson<CheckReport>(() => runJpAgreementCheck({ asOf: "2026-09-24", json: true }));
    expect(subject(report, "AGR36-2026-HQ").status).toBe("ok");
    expect(checkStatus(report, "AGR36-2025-OSAKA", "general-limits")).toBe("violation");
    expect(checkStatus(report, "AGR36-2025-OSAKA", "special-clause")).toBe("violation");
    expect(checkStatus(report, "AGR36-2025-OSAKA", "validity")).toBe("alert");
    expect(checkStatus(report, "AGR36-2026-LAB", "agreement-filed")).toBe("violation");
    expect(checkStatus(report, "AGR36-2026-DEPOT", "work-category")).toBe("needs_review");
    expect(checkStatus(report, "AGR36-2026-DEPOT", "special-clause")).toBe("ok");

    const afterExpiry = captureJson<CheckReport>(() => runJpAgreementCheck({ asOf: "2026-10-01", json: true }));
    expect(checkStatus(afterExpiry, "AGR36-2025-OSAKA", "validity")).toBe("violation");
  });

  it("overtime-check detects per-employee statutory and agreement violations", () => {
    const report = captureJson<CheckReport>(() => runJpOvertimeCheck({ month: "2026-08", json: true }));
    expect(subject(report, "EMP-101").status).toBe("ok");
    expect(checkStatus(report, "EMP-102", "actual-monthly-under-100")).toBe("violation");
    expect(checkStatus(report, "EMP-102", "actual-rolling-average-80")).toBe("violation");
    expect(checkStatus(report, "EMP-102", "agreement-monthly")).toBe("violation");
    expect(checkStatus(report, "EMP-103", "months-over-limit")).toBe("violation");
    expect(checkStatus(report, "EMP-104", "actual-rolling-average-80")).toBe("needs_review");
    expect(checkStatus(report, "EMP-201", "actual-monthly-under-100")).toBe("needs_review");
    expect(checkStatus(report, "EMP-201", "annual-overtime")).toBe("ok");

    const beforeBreach = captureJson<CheckReport>(() => runJpOvertimeCheck({ month: "2026-05", json: true }));
    expect(checkStatus(beforeBreach, "EMP-102", "actual-monthly-under-100")).toBe("ok");
  });

  it("draft renders templates without writing by default", () => {
    const workRules = captureJson<{ kind: string; written: boolean; content: string }>(() =>
      runJpWorkRulesDraft({ kind: "work-rules", workplace: "WP-DEPOT", json: true })
    );
    expect(workRules.written).toBe(false);
    expect(workRules.content).toContain("交替制の就業時転換");
    expect(workRules.content).not.toContain("{{");

    const agreement = captureJson<{ kind: string; written: boolean; content: string }>(() =>
      runJpWorkRulesDraft({ kind: "agreement", agreement: "AGR36-2026-HQ", json: true })
    );
    expect(agreement.kind).toBe("agreement");
    expect(agreement.content).toContain("様式第9号の2");
    expect(agreement.content).not.toContain("{{");
  });
});

describe("jp_employment_rules non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("check fails the jurisdiction rule on hk-demo", () => {
    const report = captureJson<CheckReport>(() => runJpWorkRulesCheck({ json: true }));
    expect(report.checks.find((c) => c.id === "req-jp")?.status).toBe("violation");
    expect(report.status).toBe("violation");
  });

  it("agreement-check fails the jurisdiction rule on hk-demo", () => {
    const report = captureJson<CheckReport>(() => runJpAgreementCheck({ asOf: "2026-09-24", json: true }));
    expect(report.checks.find((c) => c.id === "req-jp")?.status).toBe("violation");
  });
});
