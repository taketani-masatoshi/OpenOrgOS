// @catalog-ids: jp_data_breach
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  breachAsOfDate,
  breachIncidentSchema,
  type BreachIncident,
} from "../../schemas/jp-data-breach.js";
import { listModuleCliBundles } from "../../src/lib/module-cli.js";
import { loadModuleManifest } from "../../src/lib/modules.js";
import { validateSkillRegistryFiles } from "../../src/lib/skill-registry.js";
import { setTenantId } from "../../src/lib/tenant.js";
import { jp_data_breachCli } from "../../steward/jurisdiction-packs/JP/modules/jp_data_breach/cli/register.js";
import {
  AFFECTED_COUNT_THRESHOLD,
  assessIncident,
  buildReportItems,
  computeIncidentDeadlines,
  dayNumberDate,
  elapsedDayNumber,
  exceedsAffectedThreshold,
  FINAL_REPORT_DAYS,
  FINAL_REPORT_DAYS_UNLAWFUL_PURPOSE,
  finalReportDueDate,
  finalReportStatus,
  preliminaryWindowStatus,
  runJpDataBreachAssess,
  runJpDataBreachDeadlines,
  runJpDataBreachDraft,
  runJpDataBreachShow,
  runJpDataBreachValidate,
  validateIncidents,
} from "../../steward/jurisdiction-packs/JP/modules/jp_data_breach/cli/lib.js";
import { describeCatalogModule } from "./catalog-module-harness.js";

const MODULE_ID = "jp_data_breach";
const HOLIDAYS_2026_2027 = new Set([
  "2026-10-12",
  "2026-11-03",
  "2026-11-23",
  "2027-01-01",
  "2027-01-11",
]);

function makeIncident(overrides: Record<string, unknown> = {}): BreachIncident {
  return breachIncidentSchema.parse({
    id: "BR-TEST-001",
    title: "テスト事案",
    known_on: "2026-09-01",
    discovered_by: "情報システム部",
    data_items: ["氏名"],
    flags: {
      sensitive: false,
      financial_harm_risk: false,
      unlawful_purpose: false,
      encrypted_high_level: false,
    },
    affected_count: 10,
    report_recipient: "ppc",
    ...overrides,
  });
}

function withFlags(
  flags: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): BreachIncident {
  const base = makeIncident();
  return makeIncident({ flags: { ...base.flags, ...flags }, ...overrides });
}

function captureJson(run: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  run();
  const output = String(spy.mock.calls[0]?.[0]);
  spy.mockRestore();
  return JSON.parse(output) as Record<string, unknown>;
}

describeCatalogModule(MODULE_ID);

describe("jp_data_breach — 施行規則7条4号 本人の数の閾値", () => {
  it("1,000 は非該当 · 1,001 で該当（千人を超える）", () => {
    expect(AFFECTED_COUNT_THRESHOLD).toBe(1000);
    expect(exceedsAffectedThreshold(999)).toBe(false);
    expect(exceedsAffectedThreshold(1000)).toBe(false);
    expect(exceedsAffectedThreshold(1001)).toBe(true);
  });

  it("assess: 1,000 → not_reportable, 1,001 → over_threshold", () => {
    expect(assessIncident(makeIncident({ affected_count: 1000 })).status).toBe("not_reportable");
    const over = assessIncident(makeIncident({ affected_count: 1001 }));
    expect(over.status).toBe("reportable");
    expect(over.triggered).toEqual(["over_threshold"]);
  });

  it("本人の数不明は最大数で判定し、最大数もなければ needs_review", () => {
    expect(
      assessIncident(makeIncident({ affected_count: "unknown", affected_count_upper_bound: 1001 }))
        .triggered
    ).toEqual(["over_threshold"]);
    expect(
      assessIncident(makeIncident({ affected_count: "unknown", affected_count_upper_bound: 1000 }))
        .status
    ).toBe("not_reportable");
    const unknown = assessIncident(makeIncident({ affected_count: "unknown" }));
    expect(unknown.status).toBe("needs_review");
    expect(unknown.needs_review.join()).toContain("本人の数");
    expect(
      assessIncident(makeIncident({ affected_count: 800, affected_count_upper_bound: 1200 }))
        .triggered
    ).toEqual(["over_threshold"]);
  });
});

describe("jp_data_breach — 施行規則7条1〜3号 · 暗号化除外", () => {
  it("①要配慮 → 確報30日 · ③不正目的 → 60日（他号と重複しても60日）", () => {
    const sensitive = assessIncident(withFlags({ sensitive: true }));
    expect(sensitive.triggered).toEqual(["sensitive"]);
    expect(sensitive.final_report_days).toBe(FINAL_REPORT_DAYS);
    const both = assessIncident(withFlags({ sensitive: true, unlawful_purpose: true }));
    expect(both.triggered).toEqual(["sensitive", "unlawful_purpose"]);
    expect(both.final_report_days).toBe(FINAL_REPORT_DAYS_UNLAWFUL_PURPOSE);
  });

  it("②財産的被害のおそれ", () => {
    expect(assessIncident(withFlags({ financial_harm_risk: true })).triggered).toEqual([
      "financial_harm_risk",
    ]);
  });

  it("取得しようとしている個人情報（2024-04-01 施行）は③のみ · DB 入力予定が要件", () => {
    const scope = { data_scope: "being_acquired" };
    const planned = assessIncident(
      withFlags(
        { unlawful_purpose: true, financial_harm_risk: true },
        { ...scope, intended_for_database: true }
      )
    );
    expect(planned.triggered).toEqual(["unlawful_purpose"]);
    expect(
      assessIncident(
        withFlags({ unlawful_purpose: true }, { ...scope, intended_for_database: false })
      ).status
    ).toBe("not_reportable");
    const undecided = assessIncident(withFlags({ unlawful_purpose: true }, scope));
    expect(undecided.status).toBe("needs_review");
    expect(
      assessIncident(withFlags({ sensitive: true }, { ...scope, intended_for_database: true }))
        .status
    ).toBe("not_reportable");
  });

  it("高度な暗号化 + 復号鍵漏えいなし → 1〜4号すべて除外", () => {
    const excluded = assessIncident(
      withFlags(
        {
          sensitive: true,
          unlawful_purpose: true,
          encrypted_high_level: true,
          encryption_key_compromised: false,
        },
        { affected_count: 5000 }
      )
    );
    expect(excluded.exclusion_applied).toBe(true);
    expect(excluded.status).toBe("not_reportable");
  });

  it("復号鍵の漏えい未確認は除外せず needs_review · 鍵漏えいありは除外しない", () => {
    const keyUnknown = assessIncident(withFlags({ sensitive: true, encrypted_high_level: true }));
    expect(keyUnknown.exclusion_applied).toBe(false);
    expect(keyUnknown.status).toBe("reportable");
    expect(keyUnknown.needs_review.join()).toContain("復号鍵");
    const keyLeaked = assessIncident(
      withFlags({ sensitive: true, encrypted_high_level: true, encryption_key_compromised: true })
    );
    expect(keyLeaked.exclusion_applied).toBe(false);
    expect(keyLeaked.needs_review).toEqual([]);
  });

  it("unknown フラグは黙って通さず needs_review", () => {
    expect(assessIncident(withFlags({ unlawful_purpose: "unknown" })).status).toBe("needs_review");
    expect(assessIncident(withFlags({ encrypted_high_level: "unknown" })).status).toBe(
      "needs_review"
    );
  });

  it("報告先未確定・権限委任は needs_review", () => {
    const undetermined = assessIncident(
      withFlags({ sensitive: true }, { report_recipient: "undetermined" })
    );
    expect(undetermined.needs_review.join()).toContain("報告先");
    const delegated = assessIncident(
      withFlags({ sensitive: true }, { report_recipient: "delegated_minister" })
    );
    expect(delegated.needs_review.join()).toContain("権限委任先");
  });

  it("受託者: 委託元へ通知済なら免除 · 未通知なら委託元通知を監視", () => {
    const entrustee = { is_entrustee: true, entrustor_ref: "STK-X" };
    expect(
      assessIncident(
        withFlags({ sensitive: true }, { ...entrustee, entrustor_notified_on: "2026-09-02" })
      ).obligation
    ).toBe("entrustee_exempt");
    const pending = withFlags({ sensitive: true }, entrustee);
    const deadlines = computeIncidentDeadlines(
      pending,
      assessIncident(pending),
      "2026-09-02",
      HOLIDAYS_2026_2027
    );
    expect(deadlines.items.map((i) => i.id)).toEqual([
      "entrustor_notice",
      "preliminary",
      "final",
      "individual_notice",
    ]);
  });
});

describe("jp_data_breach — 期限計算（known_on を1日目）", () => {
  it("日付は暦日として実在するもののみ", () => {
    expect(breachAsOfDate.safeParse("2026-02-28").success).toBe(true);
    expect(breachAsOfDate.safeParse("2026-02-29").success).toBe(false);
    expect(breachAsOfDate.safeParse("2026-13-01").success).toBe(false);
  });

  it("known_on 当日が1日目", () => {
    expect(elapsedDayNumber("2026-09-01", "2026-09-01")).toBe(1);
    expect(dayNumberDate("2026-09-01", 30)).toBe("2026-09-30");
  });

  it("速報 GL 目安: 2日目 pending · 3日目 due_soon · 5日目 due_soon · 6日目 overdue", () => {
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-02")).toBe("pending");
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-03")).toBe("due_soon");
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-05")).toBe("due_soon");
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-06")).toBe("overdue");
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-10", "2026-09-05")).toBe("done");
    expect(preliminaryWindowStatus("2026-09-01", "2026-09-10", "2026-09-06")).toBe("done_late");
  });

  it("確報期限: 30日目 · 60日目が日曜 → 月曜 · 祝日 → 翌日 · 年末年始 → 1/4", () => {
    expect(finalReportDueDate("2026-09-01", FINAL_REPORT_DAYS, HOLIDAYS_2026_2027)).toBe(
      "2026-09-30"
    );
    expect(
      finalReportDueDate("2026-08-20", FINAL_REPORT_DAYS_UNLAWFUL_PURPOSE, HOLIDAYS_2026_2027)
    ).toBe("2026-10-19");
    expect(finalReportDueDate("2026-10-25", FINAL_REPORT_DAYS, HOLIDAYS_2026_2027)).toBe(
      "2026-11-24"
    );
    expect(finalReportDueDate("2026-11-30", FINAL_REPORT_DAYS, HOLIDAYS_2026_2027)).toBe(
      "2027-01-04"
    );
  });

  it("確報状況: 期限当日 due_soon · 翌日 overdue · 残8日 pending · 残7日 due_soon", () => {
    expect(finalReportStatus("2026-09-30", "2026-09-30")).toBe("due_soon");
    expect(finalReportStatus("2026-09-30", "2026-10-01")).toBe("overdue");
    expect(finalReportStatus("2026-09-30", "2026-09-22")).toBe("pending");
    expect(finalReportStatus("2026-09-30", "2026-09-23")).toBe("due_soon");
    expect(finalReportStatus("2026-09-30", "2026-10-05", "2026-09-30")).toBe("done");
    expect(finalReportStatus("2026-09-30", "2026-10-05", "2026-10-01")).toBe("done_late");
  });

  it("祝日カレンダー未整備年は needs_review", () => {
    const incident = withFlags({ sensitive: true }, { known_on: "2028-03-01" });
    const deadlines = computeIncidentDeadlines(
      incident,
      assessIncident(incident),
      "2028-03-02",
      HOLIDAYS_2026_2027
    );
    const final = deadlines.items.find((i) => i.id === "final");
    expect(final?.needs_review.join()).toContain("2028");
  });

  it("確報提出済みなら速報も兼ねたものとして done", () => {
    const incident = withFlags(
      { sensitive: true },
      { reports: { final_submitted_on: "2026-09-04" } }
    );
    const deadlines = computeIncidentDeadlines(
      incident,
      assessIncident(incident),
      "2026-09-20",
      HOLIDAYS_2026_2027
    );
    expect(deadlines.items.find((i) => i.id === "preliminary")?.status).toBe("done");
  });
});

describe("jp_data_breach — 台帳検証 · 報告事項", () => {
  it("data_items の実値・重複 id・委託元参照漏れを検出", () => {
    const issues = validateIncidents([
      makeIncident({ data_items: ["sample@example.invalid"] }),
      makeIncident({ is_entrustee: true }),
    ]);
    expect(issues.join("\n")).toContain("categories only");
    expect(issues.join("\n")).toContain("duplicate incident id");
    expect(issues.join("\n")).toContain("entrustor_ref");
  });

  it("報告事項は施行規則8条1項の9項目 · 未把握は missing", () => {
    const incident = withFlags({ sensitive: true });
    const items = buildReportItems(incident, assessIncident(incident));
    expect(items).toHaveLength(9);
    expect(items.find((i) => i.no === 4)?.missing).toBe(true);
    expect(items.find((i) => i.no === 3)?.value).toContain("10 人");
  });
});

describe("jp_data_breach CLI on demo seed", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("manifest cli_commands match registered subcommands · skills valid", () => {
    const manifest = loadModuleManifest(MODULE_ID);
    const program = new Command();
    const operationsCmd = program.command("operations");
    jp_data_breachCli.register({ program, operationsCmd });
    const root = operationsCmd.commands.find((c) => c.name() === "data-breach");
    expect(root?.commands.map((c) => c.name())).toEqual(manifest?.cli_commands);
    expect(manifest?.notes?.startsWith("activation_ready — ")).toBe(true);
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain(MODULE_ID);
    expect(validateSkillRegistryFiles()).toEqual([]);
  });

  it("show summarizes seed incidents", () => {
    const summary = captureJson(() => runJpDataBreachShow({ json: true }));
    expect(summary.jurisdiction).toBe("JP");
    expect(summary.incidents).toBe(6);
    expect(summary.reportable).toBe(3);
    expect(summary.needs_review).toBe(1);
  });

  it("validate passes seed data", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpDataBreachValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_data_breach — breach incident data OK");
    spy.mockRestore();
  });

  it("assess detects ③ on being-acquired info and the encryption exclusion", () => {
    const unlawful = captureJson(() =>
      runJpDataBreachAssess({ incident: "BR-2026-002", json: true })
    );
    expect(unlawful.triggered).toEqual(["unlawful_purpose"]);
    expect(unlawful.final_report_days).toBe(60);
    const encrypted = captureJson(() =>
      runJpDataBreachAssess({ incident: "BR-2026-005", json: true })
    );
    expect(encrypted.exclusion_applied).toBe(true);
    expect(encrypted.status).toBe("not_reportable");
    const boundary = captureJson(() =>
      runJpDataBreachAssess({ incident: "BR-2026-003", json: true })
    );
    expect(boundary.status).toBe("not_reportable");
  });

  it("deadlines flags overdue preliminary and the Sunday roll-forward", () => {
    const result = captureJson(() => runJpDataBreachDeadlines({ asOf: "2026-09-24", json: true }));
    const incidents = result.incidents as Array<{
      incident_id: string;
      items: Array<{ id: string; status: string; due_on: string | null }>;
    }>;
    const ec = incidents.find((i) => i.incident_id === "BR-2026-002");
    expect(ec?.items.find((i) => i.id === "preliminary")?.status).toBe("overdue");
    expect(ec?.items.find((i) => i.id === "final")?.due_on).toBe("2026-10-19");
    const usb = incidents.find((i) => i.incident_id === "BR-2026-001");
    expect(usb?.items.find((i) => i.id === "final")?.status).toBe("due_soon");
    expect(result.passed).toBe(false);
  });

  it("draft lists missing items for a final report without writing", () => {
    const draft = captureJson(() =>
      runJpDataBreachDraft({
        incident: "BR-2026-001",
        kind: "final",
        asOf: "2026-09-24",
        json: true,
      })
    );
    expect(draft.missing_items).toEqual([7]);
    expect(draft.written).toBe(false);
    expect(String(draft.output_path)).toContain(
      "docs/compliance/privacy/breach/BR-2026-001/final-report.md"
    );
  });
});

describe("jp_data_breach non-JP tenant", () => {
  beforeEach(() => {
    setTenantId("hk-demo");
  });

  it("assess fails the jurisdiction check on hk-demo", () => {
    const result = captureJson(() =>
      runJpDataBreachAssess({ incident: "BR-2026-001", json: true })
    );
    const checks = result.checks as Array<{ id: string; ok: boolean }>;
    expect(checks.some((c) => c.id === "req-jp" && !c.ok)).toBe(true);
    expect(result.status).toBe("needs_review");
  });

  it("deadlines does not pass on hk-demo", () => {
    const result = captureJson(() => runJpDataBreachDeadlines({ asOf: "2026-09-24", json: true }));
    expect(result.passed).toBe(false);
  });

  it("validate exits with req-jp on hk-demo", () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errors.push(String(message));
    });
    vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => runJpDataBreachValidate()).toThrow("exit 1");
    expect(errors.join("\n")).toContain("req-jp");
    vi.restoreAllMocks();
  });
});
