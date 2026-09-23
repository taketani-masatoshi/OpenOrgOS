// @catalog-ids: jp_patent_application
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeModuleCliRegistrations,
  listModuleCliBundles,
} from "../../src/lib/module-cli.js";
import { checkModuleCatalogOnly, getModuleSeedDir, loadModuleManifest } from "../../src/lib/modules.js";
import { getSkillById, loadSkillRegistry, validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import {
  ABSTRACT_MAX_CHARS,
  assessFilingDate,
  buildHolidayCalendar,
  classifyOpenDeadline,
  countAbstractChars,
  DOMESTIC_PRIORITY_PERIOD_YEARS,
  EXAM_REQUEST_PERIOD_YEARS,
  findClaimNumberingIssues,
  findMultipleDependencyIssues,
  FIRST_PAYMENT_DAYS,
  isExcludedFromNoveltyException,
  jurisdictionCheck,
  NOVELTY_CERTIFICATE_DAYS,
  NOVELTY_GRACE_PERIOD_YEARS,
  noveltyWindow,
  PARIS_PRIORITY_PERIOD_MONTHS,
  PATENT_TERM_YEARS,
  priorityWindow,
  procedureDeadline,
  runJpPatentChecklist,
  runJpPatentDeadlines,
  runJpPatentDraft,
  runJpPatentShow,
  runJpPatentValidate,
  statutoryDaysEnd,
  statutoryPeriodEnd,
} from "../../steward/jurisdiction-packs/JP/modules/jp_patent_application/cli/lib.js";
import { validateModuleSeeds } from "../../steward/jurisdiction-packs/JP/modules/jp_patent_application/seed/validate.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_patent_application";

const CALENDAR = buildHolidayCalendar({
  covered_years: [2026, 2027],
  national_holidays: [
    { date: "2026-03-20", name: "春分の日" },
    { date: "2026-09-22", name: "休日" },
    { date: "2026-09-23", name: "秋分の日" },
    { date: "2026-10-12", name: "スポーツの日" },
  ],
  year_end_closures: [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
    "2027-12-29",
    "2027-12-30",
    "2027-12-31",
  ],
});

function captureJson<T>(run: () => void): T {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as T;
}

describeCatalogModule(MODULE_ID);

describe("jp_patent_application contract", () => {
  it("manifest declares activation seeds and registered CLI commands", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    expect(manifest?.id).toBe(MODULE_ID);
    expect(manifest?.required_seeds).toEqual([]);
    expect(manifest?.notes?.startsWith("activation_ready — ")).toBe(true);
    expect(manifest?.security?.limits?.concurrent_jobs).toBe(1);
    expect(checkModuleCatalogOnly(MODULE_ID, "activation_ready")).toEqual([]);

    const registration = describeModuleCliRegistrations().get(MODULE_ID);
    expect(registration?.rootPath).toEqual(["operations", "patent"]);
    expect([...(registration?.subcommands ?? [])].sort()).toEqual([...(manifest?.cli_commands ?? [])].sort());
    expect(listModuleCliBundles().map((bundle) => bundle.moduleId)).toContain(MODULE_ID);
  });

  it("registers unique cli skills for intellectual_property", () => {
    expect(validateSkillRegistryFiles()).toEqual([]);
    const skills = loadSkillRegistry().filter((skill) => skill.moduleId === MODULE_ID);
    expect(skills.map((skill) => skill.id).sort()).toEqual(["jp_patent_deadlines", "jp_patent_draft"]);
    for (const skill of skills) {
      expect(skill.runtime).toBe("cli");
      expect(skill.agent_id).toBe("intellectual_property");
    }
    expect(getSkillById("jp_patent_draft")?.cli_command).toBe("operations patent draft");
    expect(getSkillById("jp_patent_deadlines")?.cli_command).toBe("operations patent deadlines");
  });

  it("seed validator passes", () => {
    expect(() => validateModuleSeeds(getModuleSeedDir(MODULE_ID))).not.toThrow();
  });
});

describe("jp_patent_application statutory periods", () => {
  it("computes domestic priority as one year and Paris as 12 months", () => {
    expect(statutoryPeriodEnd("2026-02-10", { years: DOMESTIC_PRIORITY_PERIOD_YEARS })).toBe("2027-02-10");
    expect(statutoryPeriodEnd("2025-03-10", { months: PARIS_PRIORITY_PERIOD_MONTHS })).toBe("2026-03-10");
    expect(statutoryPeriodEnd("2025-03-20", { years: NOVELTY_GRACE_PERIOD_YEARS })).toBe("2026-03-20");
    expect(statutoryPeriodEnd("2024-01-15", { years: EXAM_REQUEST_PERIOD_YEARS })).toBe("2027-01-15");
  });

  it("extends a Saturday first-payment deadline across Sports Day", () => {
    const deadline = procedureDeadline("2026-10-10", CALENDAR);
    expect(deadline.statutory_end).toBe("2026-10-10");
    expect(deadline.due).toBe("2026-10-13");
    expect(deadline.holiday_extended).toBe(true);
  });

  it("treats a Paris filing after the priority period as restorable within two months", () => {
    const window = priorityWindow({ kind: "paris", base_filed_on: "2025-03-10" }, CALENDAR);
    expect(assessFilingDate("2026-03-23", window)).toBe("restorable");
    expect(assessFilingDate("2026-03-10", window)).toBe("within");
  });

  it("excludes patent gazette disclosures from the novelty exception", () => {
    expect(
      isExcludedFromNoveltyException({
        disclosed_on: "2025-12-01",
        kind: "patent_gazette",
        against_will: false,
      }),
    ).toBe(true);
    const window = noveltyWindow(
      { disclosed_on: "2025-03-20", kind: "website", against_will: false },
      CALENDAR,
    );
    expect(assessFilingDate("2026-03-23", window)).toBe("within_by_holiday");
  });

  it("places exam-request, certificate, and term ends just below / at / after the statutory day", () => {
    expect(statutoryPeriodEnd("2024-01-15", { years: EXAM_REQUEST_PERIOD_YEARS })).toBe("2027-01-15");
    expect(statutoryDaysEnd("2026-03-23", NOVELTY_CERTIFICATE_DAYS)).toBe("2026-04-22");
    expect(statutoryDaysEnd("2026-09-10", FIRST_PAYMENT_DAYS)).toBe("2026-10-10");
    expect(statutoryPeriodEnd("2020-12-01", { years: PATENT_TERM_YEARS })).toBe("2040-12-01");
    expect(classifyOpenDeadline("2026-10-24", "2026-09-24")).toBe("due");
    expect(classifyOpenDeadline("2026-10-25", "2026-09-24")).toBe("upcoming");
    expect(classifyOpenDeadline("2026-09-23", "2026-09-24")).toBe("overdue");
  });

  it("flags claim numbering, multi-multi, and abstract length at the 400-character limit", () => {
    expect(findClaimNumberingIssues([{ no: 1, text: "A", refers_to: [], reference_mode: "alternative" }])).toEqual([]);
    expect(findClaimNumberingIssues([{ no: 2, text: "A", refers_to: [], reference_mode: "alternative" }])).toHaveLength(1);
    const multiMulti = findMultipleDependencyIssues([
      { no: 1, text: "A", refers_to: [], reference_mode: "alternative" },
      { no: 2, text: "B", refers_to: [1], reference_mode: "alternative" },
      { no: 3, text: "C", refers_to: [1, 2], reference_mode: "alternative" },
      { no: 4, text: "D", refers_to: [2, 3], reference_mode: "alternative" },
    ]);
    expect(multiMulti.some((issue) => issue.includes("請求項4"))).toBe(true);
    expect(countAbstractChars("あ".repeat(ABSTRACT_MAX_CHARS))).toBe(400);
    expect(countAbstractChars("あ".repeat(ABSTRACT_MAX_CHARS + 1))).toBe(401);
  });
});

describe("jp_patent_application CLI on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("show summarizes seed applications", () => {
    const summary = captureJson<{ jurisdiction: string; applications: number }>(() =>
      runJpPatentShow({ json: true }),
    );
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.applications).toBeGreaterThanOrEqual(4);
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpPatentValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_patent_application — patent data OK");
    spy.mockRestore();
  });

  it("deadlines flag the seeded Paris restoration case", () => {
    const report = captureJson<{
      deadlines: Array<{ application_id: string; id: string; status: string }>;
    }>(() => runJpPatentDeadlines({ asOf: "2026-09-24", json: true }));
    const paris = report.deadlines.find(
      (item) => item.application_id === "PAT-2026-002" && item.id.includes("priority"),
    );
    expect(paris?.status).toBe("needs_review");
  });

  it("checklist reviews the draft application", () => {
    const report = captureJson<{ summary: { overall: string } }>(() =>
      runJpPatentChecklist({ application: "PAT-2026-001", asOf: "2026-09-24", json: true }),
    );
    expect(["ok", "needs_review", "ng"]).toContain(report.summary.overall);
  });

  it("checklist detects seeded form defects on PAT-2026-002", () => {
    const report = captureJson<{
      summary: { overall: string };
      checks: Array<{ id: string; status: string }>;
    }>(() => runJpPatentChecklist({ application: "PAT-2026-002", asOf: "2026-09-24", json: true }));
    expect(report.summary.overall).toBe("ng");
    expect(report.checks.find((item) => item.id === "req-jp")?.status).toBe("ok");
    expect(report.checks.find((item) => item.id === "claims-numbering")?.status).toBe("ng");
    expect(report.checks.find((item) => item.id === "claims-multiple-dependency")?.status).toBe("ng");
    expect(report.checks.find((item) => item.id === "abstract-length")?.status).toBe("ng");
    expect(report.checks.find((item) => item.id === "novelty-window-2")?.status).toBe("ng");
  });

  it("draft prints four form files without writing", () => {
    const result = captureJson<{
      application_id: string;
      written: boolean;
      outputs: Array<{ name: string }>;
    }>(() => runJpPatentDraft({ application: "PAT-2026-001", asOf: "2026-09-24", json: true }));
    expect(result.application_id).toBe("PAT-2026-001");
    expect(result.written).toBe(false);
    expect(result.outputs.map((file) => file.name).sort()).toEqual([
      "meisaisho.md",
      "tokkyo-gan.md",
      "tokkyo-seikyu-no-hani.md",
      "yoyakusho.md",
    ]);
  });
});

describe("jp_patent_application non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deadlines and checklist fail the jurisdiction rule on hk-demo", () => {
    expect(jurisdictionCheck("HK").status).toBe("ng");
    const deadlines = captureJson<{ checks: Array<{ id: string; status: string }> }>(() =>
      runJpPatentDeadlines({ asOf: "2026-09-24", json: true }),
    );
    expect(deadlines.checks.find((item) => item.id === "req-jp")?.status).toBe("ng");
    const checklist = captureJson<{ checks: Array<{ id: string; status: string }> }>(() =>
      runJpPatentChecklist({ application: "PAT-2026-001", asOf: "2026-09-24", json: true }),
    );
    expect(checklist.checks.find((item) => item.id === "req-jp")?.status).toBe("ng");
  });

  it("validate exits with a jurisdiction issue on hk-demo", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => runJpPatentValidate()).toThrow("exit 1");
    expect(errors.some((line) => line.includes("JP-only"))).toBe(true);
  });
});
