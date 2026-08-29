import { beforeEach, describe, expect, it } from "vitest";
import {
  applyFactRefusalGuard,
  handleFactChatMessage,
  listFactProviders,
  matchProviderByIntent,
} from "../src/lib/operator-facts/index.js";
import {
  assertAnalyticsDashboardNoL2,
  buildAnalyticsDashboardPayload,
} from "../src/lib/canvas-views/builders/analytics-dashboard.js";
import { setTenantId } from "../src/lib/tenant.js";
import { metricsCatalogFileSchema, ANALYTICS_FORBIDDEN_VALUE_FIELDS } from "../schemas/analytics/index.js";

describe("steward chat analytics kpi fact provider", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("matches KPI intents without depending on registry order", () => {
    expect(matchProviderByIntent("KPI スコアカードを見せて")?.id).toBe("analytics_kpi");
    expect(matchProviderByIntent("メトリクスの一覧")?.id).toBe("analytics_kpi");
    expect(matchProviderByIntent("今日の天気")?.id).not.toBe("analytics_kpi");
  });

  it("leaves finance wording with the finance provider", () => {
    expect(matchProviderByIntent("バーンレートは？")?.id).toBe("finance_metrics");
    expect(matchProviderByIntent("経営指標の状況は？")?.id).toBe("finance_metrics");
  });

  it("claims each sample phrase for exactly one provider", () => {
    const samples = ["KPI スコアカード", "メトリクスの一覧", "バーンレートは？"];
    for (const sample of samples) {
      const claimants = listFactProviders().filter((p) => p.intent.test(sample.normalize("NFKC")));
      expect(claimants.map((p) => p.id)).toHaveLength(1);
    }
  });

  it("answers deterministically for mal", () => {
    const result = handleFactChatMessage("KPI スコアカード");
    expect(result.handled).toBe(true);
    expect(result.providerId).toBe("analytics_kpi");
    expect(result.reply).toMatch(/KPI/);
    expect(result.reply).not.toMatch(/metrics\.yaml|決定論パス/);
  });

  it("recovers placeholder KPI refusal essays", () => {
    const fake = "正確なKPIを把握するためには Analytics Agent が必要です。";
    const guarded = applyFactRefusalGuard("KPI どう？", fake);
    expect(guarded.guarded).toBe(true);
    expect(guarded.reply).toMatch(/KPI/);
  });
});

describe("analytics dashboard payload", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("builds canvas view with kpi rows and passes L2 guard", () => {
    const payload = buildAnalyticsDashboardPayload({ expensive: "cached" });
    expect(payload.view_model.view_id).toBe("analytics-dashboard");
    expect(payload.kpi.rows.length).toBeGreaterThan(0);
    expect(payload).toHaveProperty("data_quality_overall");
    expect(payload.view_model.sections.some((s) => s.type === "table")).toBe(true);
    expect(() => assertAnalyticsDashboardNoL2(payload)).not.toThrow();
  });

  it("blocks L2 values anywhere in the payload, not just the view model", () => {
    const payload = buildAnalyticsDashboardPayload({ expensive: "cached" });
    expect(() =>
      assertAnalyticsDashboardNoL2({ ...payload, leaked: "連絡先 ceo@example.com" })
    ).toThrow(/email address/);
    expect(() =>
      assertAnalyticsDashboardNoL2({ ...payload, leaked: "〒150-0001 東京都" })
    ).toThrow(/postal address/);
    expect(() =>
      assertAnalyticsDashboardNoL2({ ...payload, leaked: "tenants/mal/data/finance/" })
    ).toThrow(/absolute workspace path/);
  });

  it("exposes month-over-month fields on every row", () => {
    const payload = buildAnalyticsDashboardPayload({ expensive: "cached" });
    for (const row of payload.kpi.rows) {
      expect(row).toHaveProperty("prev_value");
      expect(row).toHaveProperty("mom_delta");
      expect(row).toHaveProperty("mom_delta_pct");
      if (row.prev_value === null) expect(row.mom_delta).toBeNull();
    }
  });
});

describe("analytics metric catalog schema", () => {
  it("rejects L2 actual-value fields on metric definitions", () => {
    const raw = {
      version: 1 as const,
      metrics: [
        {
          id: "MET-TEST",
          title: "test",
          category: "finance",
          resolver: "finance.dashboard.cash_balance",
          direction: "higher_better",
          unit: "yen",
          owner_agent: "finance",
          actual_value: 999,
        },
      ],
    };
    expect(() => metricsCatalogFileSchema.parse(raw)).toThrow();
    expect(ANALYTICS_FORBIDDEN_VALUE_FIELDS).toContain("actual_value");
  });
});

describe("operator facts registry analytics", () => {
  it("includes analytics_kpi provider", () => {
    const providers = listFactProviders();
    expect(providers.some((p) => p.id === "analytics_kpi")).toBe(true);
    expect(providers.length).toBeGreaterThanOrEqual(5);
  });
});
