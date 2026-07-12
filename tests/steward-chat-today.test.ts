import { afterEach, describe, expect, it } from "vitest";
import { todayContextSchema } from "../schemas/steward-chat.js";
import {
  buildTodayContext,
  formatTodayContextMarkdown,
} from "../src/lib/steward-chat/today-context.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getCashflowTodaySummary } from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDocsDir } from "../src/lib/utils.js";

describe("steward chat today", () => {
  const snapshots = new Map<string, string | undefined>();

  function snapshotAndWrite(path: string, content: string): void {
    snapshots.set(
      path,
      existsSync(path) ? readFileSync(path, "utf-8") : undefined
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
  }

  afterEach(() => {
    for (const [path, content] of snapshots) {
      if (content === undefined) {
        rmSync(path, { force: true });
      } else {
        writeFileSync(path, content, "utf-8");
      }
    }
    snapshots.clear();
    setTenantId("demo");
  });

  it("builds TodayContext for demo tenant with max 3 decisions", () => {
    setTenantId("demo");
    const ctx = buildTodayContext();
    const parsed = todayContextSchema.parse(ctx);
    expect(parsed.tenant).toBe("demo");
    expect(parsed.decisions.length).toBeLessThanOrEqual(3);
    expect(Array.isArray(parsed.wire_pending)).toBe(true);
    expect(parsed.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes tenant agent roster summary (L1 ids only)", () => {
    setTenantId("mal");
    const ctx = buildTodayContext();
    expect(ctx.agent_roster_configured).toBe(true);
    expect(ctx.agent_roster_operational_count).toBeGreaterThan(0);
    expect(ctx.agent_roster_operational.map((a) => a.id)).toContain("executive_steward");
    const markdown = formatTodayContextMarkdown(ctx);
    expect(markdown).toContain("## Agent roster");
    expect(markdown).toContain("executive_steward");
    expect(markdown).toContain("agent roster show");
  });

  it("does not include bank account patterns in KPI values (L1 surface)", () => {
    setTenantId("demo");
    const ctx = buildTodayContext();
    const kpiBlob = JSON.stringify(ctx.kpis);
    expect(kpiBlob).not.toMatch(/\d{7,}/);
  });

  it("renders CEO actions first without internal CLI or operator work", () => {
    setTenantId("demo");
    const markdown = formatTodayContextMarkdown(buildTodayContext());
    expect(markdown.split("\n").slice(1, 3).join("\n")).toContain("**結論:**");
    expect(markdown).not.toContain("orgos ");
    expect(markdown).not.toContain("Agent 報告チェーン");
    expect(markdown).not.toContain("Mail Intake（受信メール）");
    expect(markdown).not.toContain("Steward inbox");
  });

  it("does not implicitly recompute cashflow when no schedule exists", () => {
    setTenantId("demo");
    expect(getCashflowTodaySummary()).toEqual({});
    const ctx = buildTodayContext();
    expect(ctx.cashflow_schedule_path).toBeUndefined();
    expect(ctx.cashflow_shortfall_date).toBeUndefined();
    expect(ctx.cashflow_runway_days).toBeUndefined();
    expect(ctx.cashflow_required_funding_amount).toBeUndefined();
    expect(ctx.cashflow_required_funding_by_date).toBeUndefined();
  });

  it("reads the latest JSON schedule as a repo-relative L1 summary", () => {
    setTenantId("demo");
    const schedulePath = join(
      getDocsDir(),
      "finance",
      "treasury",
      "cashflow-schedule",
      "9999-12-31-weekly.json"
    );
    snapshotAndWrite(
      schedulePath,
      JSON.stringify({
        generated_at: "2020-01-01T00:00:00.000Z",
        granularity: "weekly",
        horizon_start: "9999-12-31",
        horizon_end: "9999-12-31",
        opening_balance_total: 0,
        opening_balance_by_account: {},
        closing_balance_total: -250,
        closing_balance_by_account: {},
        runway_days: 3,
        shortfall_date: "9999-12-31",
        shortfall_amount: -250,
        required_funding_amount: 500,
        required_funding_by_date: "9999-12-31",
        rows: [],
        warnings: [],
      })
    );

    const summary = getCashflowTodaySummary();
    expect(summary.schedule_path).toBe(
      "tenants/demo/docs/finance/treasury/cashflow-schedule/9999-12-31-weekly.json"
    );
    expect(summary.shortfall_date).toBe("9999-12-31");
    expect(summary.runway_days).toBe(3);
    expect(summary.required_funding_amount).toBe(500);
    expect(summary.required_funding_by_date).toBe("9999-12-31");
    expect(summary.generated_at).toBe("2020-01-01T00:00:00.000Z");
    expect(summary.age_days).toBeGreaterThan(7);
    expect(summary.stale).toBe(true);
    const ctx = buildTodayContext();
    expect(ctx.cashflow_required_funding_amount).toBe(500);
    expect(ctx.cashflow_required_funding_by_date).toBe("9999-12-31");
    expect(ctx.cashflow_schedule_path).toBe(summary.schedule_path);
    expect(formatTodayContextMarkdown(ctx)).toContain("必要調達額: 500円");
  });

  it("returns only the path when the schedule exists only as Markdown", () => {
    setTenantId("demo");
    const scheduleDir = join(
      getDocsDir(),
      "finance",
      "treasury",
      "cashflow-schedule"
    );
    mkdirSync(scheduleDir, { recursive: true });
    for (const file of readdirSync(scheduleDir).filter((f) => f.endsWith("-detail.csv"))) {
      const detailPath = join(scheduleDir, file);
      snapshots.set(
        detailPath,
        existsSync(detailPath) ? readFileSync(detailPath, "utf-8") : undefined
      );
      rmSync(detailPath, { force: true });
    }
    const schedulePath = join(scheduleDir, "9999-12-31-weekly.md");
    snapshotAndWrite(schedulePath, "BODY-MUST-NOT-BE-PARSED");
    expect(getCashflowTodaySummary()).toEqual({
      schedule_path:
        "tenants/demo/docs/finance/treasury/cashflow-schedule/9999-12-31-weekly.md",
    });
  });

  it("connects latest agent summaries by repo-relative path without body content", () => {
    setTenantId("demo");
    const summaryPath = join(
      getDocsDir(),
      "reports",
      "agent-summaries",
      "finance",
      "9999-12-31-dashboard-sync.md"
    );
    snapshotAndWrite(summaryPath, "SENSITIVE-BODY-MUST-NOT-BE-READ");

    const ctx = buildTodayContext();
    expect(ctx.agent_summary_paths).toContain(
      "tenants/demo/docs/reports/agent-summaries/finance/9999-12-31-dashboard-sync.md"
    );
    expect(JSON.stringify(ctx)).not.toContain("SENSITIVE-BODY-MUST-NOT-BE-READ");
  });
});
