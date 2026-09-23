// @catalog-ids: jp_visa_employment
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  foreignWorkerSchema,
  foreignWorkersFileSchema,
  statusCatalogFileSchema,
  visaAsOfDate,
  weeklyHoursFileSchema,
  type ForeignWorker,
  type StatusCatalogEntry,
  type WeeklyHoursRecord,
} from "../../schemas/jp-visa-employment.js";
import { describeModuleCliRegistrations, listModuleCliBundles } from "../../src/lib/module-cli.js";
import { checkModuleCatalogOnly, getModuleSeedDir, loadModuleManifest } from "../../src/lib/modules.js";
import { loadSkillRegistry, validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import { readYamlFile } from "../../src/lib/utils.js";
import { addMonths, isIsoDate } from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/dates.js";
import {
  assessEmploymentNotices,
  assessPeriodExpiry,
  assessSelfNotificationReminders,
  classifyNotice,
  employmentNoticeDueDate,
} from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/deadlines.js";
import {
  evaluateCardVerification,
  evaluateWeeklyHours,
  evaluateWorkEligibility,
  resolveWeeklyLimitHours,
} from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/eligibility.js";
import {
  runForeignWorkersCheck,
  runForeignWorkersExpiry,
  runForeignWorkersNotifications,
  runForeignWorkersShow,
  runForeignWorkersValidate,
} from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/lib.js";
import {
  COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS,
  statutoryWorkAllowance,
} from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/statutory.js";
import { collectValidationIssues } from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/cli/validation.js";
import { validateModuleSeeds } from "../../steward/jurisdiction-packs/JP/modules/jp_visa_employment/seed/validate.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_visa_employment";
const SEED_AS_OF = "2026-09-24";

interface ReportItemJson {
  id: string;
  employee_id?: string;
  status: string;
  stage?: string;
  state?: string;
  event?: string;
  due_on?: string;
}

interface ReportJson {
  passed: boolean;
  jurisdiction: string;
  items: ReportItemJson[];
}

function worker(overrides: Partial<ForeignWorker> = {}): ForeignWorker {
  return foreignWorkerSchema.parse({
    employee_id: "EMP-900",
    status_of_residence: "engineer_humanities_international_services",
    period_expires_on: "2027-12-31",
    card_verified_on: "2026-03-25",
    card_verified_by: "EMP-001",
    job_category: "software_engineering",
    hired_on: "2026-04-01",
    employment_insurance_insured: true,
    ...overrides,
  });
}

function week(overrides: Partial<WeeklyHoursRecord> = {}): WeeklyHoursRecord {
  return {
    employee_id: "EMP-900",
    week_start: "2026-07-06",
    hours: 20,
    is_school_long_vacation: false,
    other_employer_hours: 0,
    ...overrides,
  };
}

function statusEntry(overrides: Partial<StatusCatalogEntry>): StatusCatalogEntry {
  return {
    code: "engineer_humanities_international_services",
    name_ja: "技術・人文知識・国際業務",
    legal_basis: "入管法 別表第一の二",
    work_allowed: "restricted_to_activity",
    permitted_job_categories: ["software_engineering"],
    excluded_job_categories: ["factory_line_work"],
    ...overrides,
  };
}

const COMPREHENSIVE = { granted: true, scope: "comprehensive" as const };

function loadSeedDataset() {
  const seedDir = getModuleSeedDir(MODULE_ID);
  return {
    workers: readYamlFile(join(seedDir, "foreign-workers.yaml.example"), foreignWorkersFileSchema),
    weeks: readYamlFile(join(seedDir, "weekly-hours.yaml.example"), weeklyHoursFileSchema),
    catalog: readYamlFile(join(seedDir, "status-catalog.yaml.example"), statusCatalogFileSchema),
  };
}

function captureJson(run: () => void): ReportJson {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as ReportJson;
}

function findItem(report: ReportJson, id: string, employeeId?: string): ReportItemJson | undefined {
  return report.items.find((item) => item.id === id && item.employee_id === employeeId);
}

describeCatalogModule(MODULE_ID);

describe("jp_visa_employment contract", () => {
  it("manifest declares activation seeds, concurrency limit, and registered CLI commands", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(manifest?.required_seeds).toEqual([]);
    expect(manifest?.notes?.startsWith("activation_ready — ")).toBe(true);
    expect(manifest?.security?.limits?.concurrent_jobs).toBe(1);
    expect(checkModuleCatalogOnly(MODULE_ID, "activation_ready")).toEqual([]);

    const registration = describeModuleCliRegistrations().get(MODULE_ID);
    expect(registration?.rootPath).toEqual(["operations", "foreign-workers"]);
    expect([...(registration?.subcommands ?? [])].sort()).toEqual([...(manifest?.cli_commands ?? [])].sort());
    expect(listModuleCliBundles().map((bundle) => bundle.moduleId)).toContain(MODULE_ID);
  });

  it("registers unique cli skills for human_resources", () => {
    expect(validateSkillRegistryFiles()).toEqual([]);
    const skills = loadSkillRegistry().filter((skill) => skill.moduleId === MODULE_ID);
    expect(skills.map((skill) => skill.id).sort()).toEqual(["jp_foreign_employment_notice", "jp_foreign_worker_check"]);
    for (const skill of skills) {
      expect(skill.runtime).toBe("cli");
      expect(skill.agent_id).toBe("human_resources");
    }
  });

  it("seed validator passes", () => {
    expect(() => validateModuleSeeds(getModuleSeedDir(MODULE_ID))).not.toThrow();
  });
});

describe("jp_visa_employment dates", () => {
  it("accepts calendar dates only", () => {
    expect(visaAsOfDate.safeParse("2026-02-28").success).toBe(true);
    expect(visaAsOfDate.safeParse("2026-02-29").success).toBe(false);
    expect(visaAsOfDate.safeParse("2026-13-01").success).toBe(false);
  });
});

describe("jp_visa_employment data classification", () => {
  it.each(["residence_card_number", "passport_number", "nationality", "home_address", "name"])(
    "rejects L2 key %s on worker records",
    (key) => {
      const result = foreignWorkerSchema.safeParse({ ...worker(), [key]: "x" });
      expect(result.success).toBe(false);
    }
  );
});

describe("jp_visa_employment statutory classification", () => {
  it("maps statuses to 入管法19条1項 categories", () => {
    expect(statutoryWorkAllowance("permanent_resident")).toBe("unrestricted");
    expect(statutoryWorkAllowance("long_term_resident")).toBe("unrestricted");
    expect(statutoryWorkAllowance("special_permanent_resident")).toBe("unrestricted");
    expect(statutoryWorkAllowance("engineer_humanities_international_services")).toBe("restricted_to_activity");
    expect(statutoryWorkAllowance("designated_activities")).toBe("restricted_to_activity");
    expect(statutoryWorkAllowance("student")).toBe("not_allowed");
    expect(statutoryWorkAllowance("dependent")).toBe("not_allowed");
    expect(statutoryWorkAllowance("temporary_visitor")).toBe("not_allowed");
    expect(statutoryWorkAllowance("unknown_status")).toBeNull();
  });
});

describe("jp_visa_employment work eligibility", () => {
  it("unrestricted status is ok regardless of job category", () => {
    const item = evaluateWorkEligibility({
      worker: worker({ status_of_residence: "permanent_resident", job_category: "factory_line_work" }),
      status: statusEntry({ code: "permanent_resident", name_ja: "永住者", work_allowed: "unrestricted" }),
    });
    expect(item.status).toBe("ok");
  });

  it("activity-restricted status: permitted ok · excluded alert · unmapped needs_review", () => {
    const status = statusEntry({});
    expect(evaluateWorkEligibility({ worker: worker(), status }).status).toBe("ok");
    expect(evaluateWorkEligibility({ worker: worker({ job_category: "factory_line_work" }), status }).status).toBe("alert");
    expect(evaluateWorkEligibility({ worker: worker({ job_category: "retail_sales" }), status }).status).toBe(
      "needs_review"
    );
  });

  it("no-work status: alert without permission · ok with permission · alert for 風俗営業等", () => {
    const status = statusEntry({ code: "student", name_ja: "留学", work_allowed: "not_allowed", permitted_job_categories: [] });
    const restaurant = { id: "restaurant_service", label_ja: "飲食", fueiho_regulated: false };
    const venue = { id: "adult_entertainment_venue", label_ja: "風俗営業等", fueiho_regulated: true };
    const student = worker({ status_of_residence: "student", job_category: "restaurant_service" });
    expect(evaluateWorkEligibility({ worker: student, status, jobCategory: restaurant }).status).toBe("alert");

    const permitted = worker({ ...student, permission_to_engage: COMPREHENSIVE });
    expect(evaluateWorkEligibility({ worker: permitted, status, jobCategory: restaurant }).status).toBe("ok");
    expect(evaluateWorkEligibility({ worker: permitted, status, jobCategory: venue }).status).toBe("alert");
  });

  it("unknown status code needs review", () => {
    expect(evaluateWorkEligibility({ worker: worker() }).status).toBe("needs_review");
  });
});

describe("jp_visa_employment permission hour limits (施行規則19条5項1号)", () => {
  it("comprehensive permission caps at 28h/week · individual requires recorded condition", () => {
    expect(resolveWeeklyLimitHours({ ...COMPREHENSIVE })).toBe(COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS);
    expect(resolveWeeklyLimitHours({ ...COMPREHENSIVE, weekly_limit_hours: 20 })).toBe(20);
    expect(resolveWeeklyLimitHours({ ...COMPREHENSIVE, weekly_limit_hours: 30 })).toBe(28);
    expect(resolveWeeklyLimitHours({ granted: true, scope: "individual" })).toBeNull();
    expect(resolveWeeklyLimitHours({ granted: true, scope: "individual", weekly_limit_hours: 35 })).toBe(35);
    expect(resolveWeeklyLimitHours({ granted: false, scope: "comprehensive" })).toBeNull();
  });

  it.each([
    [27, 0, "ok"],
    [28, 0, "ok"],
    [29, 0, "alert"],
    [20, 8, "ok"],
    [20, 9, "alert"],
  ])("regular week own %sh + other %sh → %s", (hours, other, expected) => {
    const item = evaluateWeeklyHours({
      week: week({ hours, other_employer_hours: other }),
      statusCode: "student",
      permission: COMPREHENSIVE,
    });
    expect(item.status).toBe(expected);
  });

  it("missing other-employer hours needs review unless own hours already exceed", () => {
    const base = { statusCode: "dependent", permission: COMPREHENSIVE };
    expect(evaluateWeeklyHours({ ...base, week: week({ hours: 20, other_employer_hours: undefined }) }).status).toBe(
      "needs_review"
    );
    expect(evaluateWeeklyHours({ ...base, week: week({ hours: 29, other_employer_hours: undefined }) }).status).toBe(
      "alert"
    );
  });

  it.each([
    [7, "ok"],
    [8, "ok"],
    [9, "alert"],
  ])("student long vacation max %sh/day → %s", (maxDaily, expected) => {
    const item = evaluateWeeklyHours({
      week: week({ hours: 40, is_school_long_vacation: true, max_daily_hours: maxDaily }),
      statusCode: "student",
      permission: COMPREHENSIVE,
    });
    expect(item.status).toBe(expected);
  });

  it("student long vacation without daily data: 56h needs review · 57h alert", () => {
    const vacation = { is_school_long_vacation: true, max_daily_hours: undefined };
    const base = { statusCode: "student", permission: COMPREHENSIVE };
    expect(evaluateWeeklyHours({ ...base, week: week({ ...vacation, hours: 56 }) }).status).toBe("needs_review");
    expect(evaluateWeeklyHours({ ...base, week: week({ ...vacation, hours: 57 }) }).status).toBe("alert");
  });

  it("long vacation relief applies only to 留学 — 家族滞在 stays at 28h/week", () => {
    const item = evaluateWeeklyHours({
      week: week({ hours: 30, is_school_long_vacation: true, max_daily_hours: 6 }),
      statusCode: "dependent",
      permission: COMPREHENSIVE,
    });
    expect(item.status).toBe("alert");
  });
});

describe("jp_visa_employment residence card verification", () => {
  it("missing verification is alert · verifier missing or late verification needs review", () => {
    expect(evaluateCardVerification(worker({ card_verified_on: undefined }), SEED_AS_OF).status).toBe("alert");
    expect(evaluateCardVerification(worker({ card_verified_by: undefined }), SEED_AS_OF).status).toBe("needs_review");
    expect(evaluateCardVerification(worker({ card_verified_on: "2026-04-02" }), SEED_AS_OF).status).toBe(
      "needs_review"
    );
    expect(evaluateCardVerification(worker({ card_verified_on: "2026-04-01" }), SEED_AS_OF).status).toBe("ok");
  });

  it("card validity boundary: valid through as-of day, alert the day after", () => {
    expect(evaluateCardVerification(worker({ card_valid_until: "2026-09-24" }), SEED_AS_OF).status).toBe("ok");
    expect(evaluateCardVerification(worker({ card_valid_until: "2026-09-23" }), SEED_AS_OF).status).toBe("alert");
  });

  it("special permanent residents are out of scope for card checks", () => {
    const item = evaluateCardVerification(
      worker({ status_of_residence: "special_permanent_resident", period_expires_on: undefined, card_verified_on: undefined }),
      SEED_AS_OF
    );
    expect(item.status).toBe("ok");
  });
});

describe("jp_visa_employment period of stay expiry", () => {
  const expiring = worker({ period_expires_on: "2026-12-24" });

  it("renewal window opens exactly 3 months before expiry", () => {
    expect(addMonths("2026-12-24", -3)).toBe("2026-09-24");
    expect(assessPeriodExpiry(expiring, "2026-09-23").stage).toBe("ok");
    expect(assessPeriodExpiry(expiring, "2026-09-24").stage).toBe("renewal_window");
  });

  it("urgent at 30 days or less · expired the day after expiry", () => {
    expect(assessPeriodExpiry(expiring, "2026-11-23").stage).toBe("renewal_window");
    expect(assessPeriodExpiry(expiring, "2026-11-24").stage).toBe("urgent");
    expect(assessPeriodExpiry(expiring, "2026-12-24").stage).toBe("urgent");
    const expired = assessPeriodExpiry(expiring, "2026-12-25");
    expect(expired.stage).toBe("expired");
    expect(expired.status).toBe("alert");
  });

  it("renewal filed within the window: ok before expiry · special period up to 2 months after", () => {
    const filed = worker({ period_expires_on: "2026-12-24", renewal_application_filed_on: "2026-10-01" });
    expect(assessPeriodExpiry(filed, "2026-12-01").stage).toBe("renewal_filed");
    expect(assessPeriodExpiry(filed, "2027-02-24").stage).toBe("special_period");
    expect(assessPeriodExpiry(filed, "2027-02-24").status).toBe("needs_review");
    expect(assessPeriodExpiry(filed, "2027-02-25").stage).toBe("expired");
  });

  it("renewal date before the window is treated as stale", () => {
    const stale = worker({ period_expires_on: "2026-12-24", renewal_application_filed_on: "2026-09-23" });
    expect(assessPeriodExpiry(stale, "2026-12-01").stage).toBe("urgent");
  });

  it("no-period statuses and missing expiry", () => {
    const permanent = worker({ status_of_residence: "permanent_resident", period_expires_on: undefined });
    expect(assessPeriodExpiry(permanent, SEED_AS_OF).stage).toBe("no_period");
    expect(assessPeriodExpiry(worker({ period_expires_on: undefined }), SEED_AS_OF).status).toBe("needs_review");
  });

  it("month arithmetic clamps to month end", () => {
    expect(addMonths("2026-05-31", -3)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
});

describe("jp_visa_employment employment notices (労働施策総合推進法施行規則12条)", () => {
  it("insured: hire by the 10th of next month · separation within 10 days from the next day", () => {
    expect(employmentNoticeDueDate("hire", "2026-01-31", true)).toBe("2026-02-10");
    expect(employmentNoticeDueDate("hire", "2026-12-15", true)).toBe("2027-01-10");
    expect(employmentNoticeDueDate("separation", "2026-09-18", true)).toBe("2026-09-28");
    expect(employmentNoticeDueDate("separation", "2026-12-25", true)).toBe("2027-01-04");
  });

  it("not insured: end of the following month for hire and separation", () => {
    expect(employmentNoticeDueDate("hire", "2026-01-15", false)).toBe("2026-02-28");
    expect(employmentNoticeDueDate("separation", "2026-12-01", false)).toBe("2027-01-31");
  });

  it("classifies filing state at the due-date boundary", () => {
    expect(classifyNotice("2026-02-10", "2026-02-10", "2026-03-01").state).toBe("filed");
    expect(classifyNotice("2026-02-10", "2026-02-11", "2026-03-01").state).toBe("filed_late");
    expect(classifyNotice("2026-02-10", undefined, "2026-02-10").state).toBe("pending");
    expect(classifyNotice("2026-02-10", undefined, "2026-02-11").state).toBe("overdue");
  });

  it("special permanent residents are not subject to the notice", () => {
    const notices = assessEmploymentNotices(
      worker({ status_of_residence: "special_permanent_resident", period_expires_on: undefined }),
      SEED_AS_OF
    );
    expect(notices.map((notice) => notice.state)).toEqual(["not_required"]);
  });

  it("self-notification reminder (入管法19条の16) shows until day 14 after the event", () => {
    const hired = worker({ hired_on: "2026-09-15" });
    expect(assessSelfNotificationReminders(hired, "2026-09-29")).toHaveLength(1);
    expect(assessSelfNotificationReminders(hired, "2026-09-30")).toHaveLength(0);
    const student = worker({ status_of_residence: "student", hired_on: "2026-09-15" });
    expect(assessSelfNotificationReminders(student, "2026-09-20")).toHaveLength(0);
  });
});

describe("jp_visa_employment validation", () => {
  it("seed dataset has no integrity issues", () => {
    expect(collectValidationIssues(loadSeedDataset())).toEqual([]);
  });

  it("detects catalog contradicting the statute and invalid worker records", () => {
    const dataset = loadSeedDataset();
    const catalog = {
      ...dataset.catalog,
      statuses: dataset.catalog.statuses.map((entry) =>
        entry.code === "student" ? { ...entry, work_allowed: "unrestricted" as const } : entry
      ),
    };
    const workers = {
      workers: [
        worker({ permission_to_engage: { ...COMPREHENSIVE, weekly_limit_hours: 30 } }),
        worker({ employee_id: "EMP-901", period_expires_on: undefined }),
      ],
    };
    const issues = collectValidationIssues({ workers, weeks: dataset.weeks, catalog });
    expect(issues.some((issue) => issue.includes("student work_allowed unrestricted contradicts statute"))).toBe(true);
    expect(issues.some((issue) => issue.includes("exceeds 28"))).toBe(true);
    expect(issues.some((issue) => issue.includes("EMP-901: period_expires_on required"))).toBe(true);
    expect(issues.some((issue) => issue.includes("weekly-hours: unknown employee_id EMP-102"))).toBe(true);
  });

  it("rejects restricted statuses with empty job-category maps and no notes", () => {
    const dataset = loadSeedDataset();
    const catalog = {
      ...dataset.catalog,
      statuses: dataset.catalog.statuses.map((entry) =>
        entry.code === "professor"
          ? { ...entry, permitted_job_categories: [], excluded_job_categories: [], notes: undefined }
          : entry
      ),
    };
    const catalogIssues = collectValidationIssues({ ...dataset, catalog });
    expect(
      catalogIssues.some((issue) =>
        issue.includes("professor is restricted_to_activity with empty permitted/excluded")
      )
    ).toBe(true);

    const unmappedCatalog = {
      ...dataset.catalog,
      statuses: dataset.catalog.statuses.map((entry) =>
        entry.code === "designated_activities"
          ? { ...entry, permitted_job_categories: [], excluded_job_categories: [], notes: undefined }
          : entry
      ),
    };
    const workerIssues = collectValidationIssues({
      workers: {
        workers: [worker({ status_of_residence: "designated_activities", job_category: "software_engineering" })],
      },
      weeks: dataset.weeks,
      catalog: unmappedCatalog,
    });
    expect(
      workerIssues.some((issue) =>
        issue.includes("designated_activities has empty permitted/excluded job categories")
      )
    ).toBe(true);
  });
});

describe("jp_visa_employment CLI on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("show summarizes seed data", () => {
    const summary = captureJson(() => runForeignWorkersShow({ json: true })) as unknown as {
      jurisdiction: string;
      workers: number;
      official_sources: number;
      data_origin: Record<string, string>;
    };
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.workers).toBe(10);
    expect(summary.official_sources).toBeGreaterThan(0);
    expect(summary.data_origin.workers).toBe("seed");
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runForeignWorkersValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_visa_employment — foreign worker data OK");
  });

  it("check detects seeded violations", () => {
    const report = captureJson(() => runForeignWorkersCheck({ asOf: SEED_AS_OF, json: true }));
    expect(report.passed).toBe(false);
    expect(findItem(report, "req-jp")?.status).toBe("ok");
    expect(findItem(report, "work-eligibility", "EMP-101")?.status).toBe("ok");
    expect(findItem(report, "work-eligibility", "EMP-103")?.status).toBe("alert");
    expect(findItem(report, "work-eligibility", "EMP-106")?.status).toBe("alert");
    expect(findItem(report, "work-eligibility", "EMP-108")?.status).toBe("needs_review");
    expect(findItem(report, "card-verification", "EMP-108")?.status).toBe("alert");
    expect(findItem(report, "specified-skilled-worker-obligations", "EMP-105")?.status).toBe("needs_review");
    const hours = report.items.filter((item) => item.id === "permission-hours" && item.employee_id === "EMP-102");
    expect(hours.map((item) => item.status)).toEqual(["ok", "alert", "needs_review", "ok", "alert"]);
    expect(report.items.some((item) => item.employee_id === "EMP-104")).toBe(false);
  });

  it("expiry reports staged alerts", () => {
    const report = captureJson(() => runForeignWorkersExpiry({ asOf: SEED_AS_OF, json: true }));
    const stageOf = (employeeId: string) => findItem(report, "period-expiry", employeeId)?.stage;
    expect(stageOf("EMP-101")).toBe("ok");
    expect(stageOf("EMP-103")).toBe("renewal_window");
    expect(stageOf("EMP-105")).toBe("urgent");
    expect(stageOf("EMP-106")).toBe("special_period");
    expect(stageOf("EMP-107")).toBe("no_period");
    expect(stageOf("EMP-109")).toBe("expired");
  });

  it("notifications reports due, overdue, late, and exempt notices", () => {
    const report = captureJson(() => runForeignWorkersNotifications({ asOf: SEED_AS_OF, json: true }));
    expect(findItem(report, "employment-notice-hire", "EMP-101")?.state).toBe("filed");
    expect(findItem(report, "employment-notice-hire", "EMP-103")?.state).toBe("overdue");
    expect(findItem(report, "employment-notice-hire", "EMP-105")?.state).toBe("filed");
    expect(findItem(report, "employment-notice-hire", "EMP-106")?.state).toBe("filed_late");
    expect(findItem(report, "employment-notice-hire", "EMP-107")?.state).toBe("not_required");
    const separation = findItem(report, "employment-notice-separation", "EMP-104");
    expect(separation?.state).toBe("pending");
    expect(separation?.due_on).toBe("2026-09-28");
    expect(findItem(report, "self-notification-hire", "EMP-110")?.status).toBe("notice");
  });

  it("rejects an invalid --as-of date", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    expect(() => runForeignWorkersCheck({ asOf: "2026-02-30", json: true })).toThrow("exit 1");
  });
});

describe("jp_visa_employment non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it.each([
    ["check", runForeignWorkersCheck],
    ["expiry", runForeignWorkersExpiry],
    ["notifications", runForeignWorkersNotifications],
  ])("%s fails the jurisdiction check on hk-demo", (_name, run) => {
    const report = captureJson(() => run({ asOf: SEED_AS_OF, json: true }));
    expect(report.jurisdiction).toBe("HK");
    expect(report.passed).toBe(false);
    expect(findItem(report, "req-jp")?.status).toBe("alert");
  });

  it("validate exits with req-jp on hk-demo", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => runForeignWorkersValidate()).toThrow("exit 1");
    expect(errors.join("\n")).toContain("req-jp");
    vi.restoreAllMocks();
  });
});
