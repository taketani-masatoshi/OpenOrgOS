import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { loadSalesOutboundCampaigns } from "../src/lib/data.js";
import {
  aggregateCoveragePct,
  buildSalesOutboundView,
  collectSalesOutboundAlerts,
  formatSalesOutboundCeoReply,
  formatSalesOutboundTodayLines,
  sortSalesOutboundAlerts,
} from "../src/lib/sales-outbound-view.js";
import type { SalesOutboundCampaignsFile } from "../schemas/index.js";

const CAMPAIGNS: SalesOutboundCampaignsFile = {
  version: 1,
  campaigns: [
    {
      id: "OUT-2026-001",
      name: "Demo campaign",
      status: "active",
      target_count: 20,
      contacted_count: 10,
      demo: true,
    },
    {
      id: "OUT-2026-002",
      name: "Real active low coverage",
      status: "active",
      target_count: 100,
      contacted_count: 10,
      next_action_due: "2026-08-28",
      next_action: "Follow up",
    },
    {
      id: "OUT-2026-003",
      name: "Draft no due",
      status: "draft",
      target_count: 50,
      contacted_count: 0,
    },
    {
      id: "OUT-2026-004",
      name: "Completed",
      status: "completed",
      target_count: 10,
      contacted_count: 10,
    },
  ],
};

describe("sales outbound view", () => {
  it("excludes demo campaigns by default", () => {
    const view = buildSalesOutboundView({
      campaigns: CAMPAIGNS,
      includeDemo: false,
    });
    expect(view.total_campaigns).toBe(3);
    expect(view.notes.some((n) => n.includes("demo"))).toBe(true);
  });

  it("counts active campaigns and coverage", () => {
    const view = buildSalesOutboundView({
      campaigns: CAMPAIGNS,
      includeDemo: false,
    });
    expect(view.active_campaigns).toBe(1);
    expect(view.by_status.active).toBe(1);
    expect(view.by_status.draft).toBe(1);
    expect(view.aggregate_coverage_pct).toBe(10);
  });

  it("aggregate coverage excludes completed campaigns", () => {
    const view = buildSalesOutboundView({
      campaigns: CAMPAIGNS,
      includeDemo: false,
    });
    expect(view.aggregate_coverage_pct).toBe(10);
    expect(view.aggregate_coverage_pct).not.toBe(12.5);
  });

  it("detects overdue, due soon, draft_no_due, and low coverage alerts", () => {
    const alerts = collectSalesOutboundAlerts(
      CAMPAIGNS.campaigns.filter((c) => !c.demo && c.status !== "completed"),
      {
        asOf: "2026-08-24",
        actionHorizonDays: 7,
        lowCoveragePct: 30,
      },
    );
    expect(alerts.some((a) => a.alert_type === "due_soon")).toBe(true);
    expect(alerts.some((a) => a.alert_type === "low_coverage")).toBe(true);
    expect(alerts.some((a) => a.alert_type === "draft_no_due")).toBe(true);
  });

  it("sorts alerts by severity then days_remaining", () => {
    const sorted = sortSalesOutboundAlerts([
      {
        campaign_id: "A",
        name: "draft",
        alert_type: "draft_no_due",
        status: "draft",
        summary: "draft",
      },
      {
        campaign_id: "B",
        name: "overdue",
        alert_type: "overdue_action",
        status: "active",
        days_remaining: -3,
        summary: "overdue",
      },
      {
        campaign_id: "C",
        name: "low",
        alert_type: "low_coverage",
        status: "active",
        coverage_pct: 5,
        summary: "low",
      },
    ]);
    expect(sorted.map((a) => a.alert_type)).toEqual([
      "overdue_action",
      "low_coverage",
      "draft_no_due",
    ]);
  });

  it("low_coverage alerts omit days_remaining", () => {
    const alerts = collectSalesOutboundAlerts(
      [
        {
          id: "OUT-2026-010",
          name: "Low",
          status: "active",
          target_count: 100,
          contacted_count: 5,
        },
      ],
      { lowCoveragePct: 30, asOf: "2026-08-24" },
    );
    const low = alerts.find((a) => a.alert_type === "low_coverage");
    expect(low?.days_remaining).toBeUndefined();
    expect(low?.coverage_pct).toBe(5);
  });

  it("formatSalesOutboundTodayLines returns three lines with coverage", () => {
    const view = buildSalesOutboundView({
      campaigns: CAMPAIGNS,
      includeDemo: false,
    });
    const lines = formatSalesOutboundTodayLines(view);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/接触率/);
  });

  it("aggregate coverage ignores campaigns without target_count", () => {
    const pct = aggregateCoveragePct([
      {
        campaign_id: "OUT-X",
        name: "No target",
        status: "active",
      },
      {
        campaign_id: "OUT-Y",
        name: "Has target",
        status: "active",
        target_count: 10,
        contacted_count: 5,
        coverage_pct: 50,
      },
    ]);
    expect(pct).toBe(50);
  });

  it("loads mal tenant campaigns with real outbound data", () => {
    setTenantId("mal");
    const view = buildSalesOutboundView({ includeDemo: false });
    expect(view.total_campaigns).toBeGreaterThan(0);
    expect(view.active_campaigns).toBeGreaterThan(0);
    const reply = formatSalesOutboundCeoReply(view);
    expect(reply).toMatch(/施策/);
    expect(reply).not.toMatch(/@/);
  });

  it("resolves outbound campaigns path lazily per tenant", () => {
    setTenantId("demo");
    expect(loadSalesOutboundCampaigns()).toBeUndefined();
    setTenantId("mal");
    expect(loadSalesOutboundCampaigns()?.campaigns.length).toBeGreaterThan(0);
  });
});
