import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildSalesPipelineView,
  buildSalesForecastView,
  collectSalesDealAlerts,
  formatSalesPipelineCeoReply,
} from "../src/lib/sales-pipeline-view.js";
import type { SalesPipelineFile } from "../schemas/index.js";

const FIXTURE: SalesPipelineFile = {
  version: 1,
  deals: [
    {
      id: "DEAL-2026-001",
      title: "Demo deal",
      stage: "negotiation",
      owner: "dan",
      counterparty: "Demo Corp",
      amount_man: 100,
      probability_pct: 50,
      next_action_due: "2020-01-01",
      stage_entered_on: "2020-01-01",
      demo: true,
    },
    {
      id: "DEAL-2026-002",
      title: "Real deal",
      stage: "proposal",
      owner: "miyagi",
      counterparty: "Real Corp",
      amount_man: 200,
      probability_pct: 40,
      next_action_due: "2099-12-31",
      stage_entered_on: "2020-01-01",
      close_date_target: "2026-08-15",
    },
  ],
};

describe("sales pipeline view", () => {
  it("excludes demo deals by default", () => {
    const view = buildSalesPipelineView({ pipeline: FIXTURE, includeDemo: false });
    expect(view.total_deals).toBe(1);
    expect(view.open_deals).toBe(1);
    expect(view.notes.some((n) => n.includes("demo"))).toBe(true);
  });

  it("includes demo deals when requested", () => {
    const view = buildSalesPipelineView({ pipeline: FIXTURE, includeDemo: true });
    expect(view.total_deals).toBe(2);
  });

  it("computes weighted pipeline for open deals", () => {
    const view = buildSalesPipelineView({ pipeline: FIXTURE, includeDemo: false });
    expect(view.weighted_pipeline_man).toBe(80);
  });

  it("detects overdue and stale alerts", () => {
    const alerts = collectSalesDealAlerts(FIXTURE.deals.filter((d) => !d.demo), {
      asOf: "2026-07-14",
      staleDays: 14,
      actionHorizonDays: 14,
    });
    expect(alerts.some((a) => a.alert_type === "overdue_action")).toBe(false);
    expect(alerts.some((a) => a.alert_type === "stale_stage")).toBe(true);
  });

  it("builds forecast for target month", () => {
    const forecast = buildSalesForecastView({
      month: "2026-08",
      includeDemo: false,
      pipeline: FIXTURE,
    });
    expect(forecast.deal_count).toBe(1);
    expect(forecast.forecast_man).toBe(80);
  });

  it("loads mal tenant pipeline", () => {
    setTenantId("mal");
    const view = buildSalesPipelineView({ includeDemo: true });
    expect(view.total_deals).toBeGreaterThan(0);
    const reply = formatSalesPipelineCeoReply(view);
    expect(reply).toMatch(/商談/);
    expect(reply).not.toMatch(/@/);
  });
});
