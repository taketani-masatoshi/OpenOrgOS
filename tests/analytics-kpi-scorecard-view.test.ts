import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDataQualityView,
  buildKpiScorecardView,
  buildMetricCatalogView,
  computeMomDelta,
  formatKpiScorecardMarkdown,
  getPreviousMonthValues,
  loadSnapshotHistory,
  previousMonthLabel,
  writeAnalyticsMonthlySnapshot,
} from "../src/lib/analytics/index.js";
import {
  clearAnalyticsResolverCache,
  createMetricResolverCache,
  resolveMetricValue,
  type MetricResolverCache,
} from "../src/lib/analytics/resolvers.js";
import { computeControlGaps } from "../src/lib/control-framework.js";
import { isAnalyticsMetricId, usesAnalyticsForeignIdPrefix } from "../schemas/analytics/index.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDocsDir } from "../src/lib/utils.js";
import { setupTempAnalyticsTenant } from "./helpers/temp-analytics-tenant.js";

describe("analytics metric id contract", () => {
  it("accepts MET- ids and rejects foreign prefixes", () => {
    expect(isAnalyticsMetricId("MET-RUNWAY")).toBe(true);
    expect(isAnalyticsMetricId("CTR-001")).toBe(false);
    expect(usesAnalyticsForeignIdPrefix("PRJ-FOO")).toBe(true);
    expect(usesAnalyticsForeignIdPrefix("MET-FOO")).toBe(false);
  });
});

/**
 * computeDataHealth / computeOs99Score scan the whole tenant (~25s each), so
 * these tests run in cached mode and cover the expensive branch with a stub.
 */
function cachedMode(): MetricResolverCache {
  return createMetricResolverCache({ expensive: "cached" });
}

describe("analytics kpi scorecard view", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("builds scorecard from mal metrics catalog", () => {
    const view = buildKpiScorecardView({ cache: cachedMode() });
    expect(view.rows.length).toBeGreaterThanOrEqual(8);
    expect(view.fiscal_year).toBe("FY2026");
    const runway = view.rows.find((r) => r.metric.id === "MET-RUNWAY");
    expect(runway?.target_value).toBe(12);
    expect(runway?.actual.formatted).toBeTruthy();
  });

  it("does not emit employee names in markdown", () => {
    const md = formatKpiScorecardMarkdown(buildKpiScorecardView({ cache: cachedMode() }));
    expect(md).toContain("KPI スコアカード");
    expect(md).toContain("MET-RUNWAY");
    expect(md).not.toMatch(/段燕燕|宮城|三塚/);
  });

  it("lists metric catalog with resolvers", () => {
    const catalog = buildMetricCatalogView();
    expect(catalog.metrics.length).toBeGreaterThan(0);
    expect(catalog.metrics.every((m) => m.id.startsWith("MET-"))).toBe(true);
  });

  it("reuses a cached data-health report instead of rescanning", () => {
    const cache = cachedMode();
    const stub: MetricResolverCache = {
      ...cache,
      dataHealth: () => ({
        overall: 82,
        grade: "B",
        metrics: [],
        recommendations: ["テスト推奨"],
      }) as ReturnType<NonNullable<MetricResolverCache["dataHealth"]>>,
    };
    const q = buildDataQualityView({ cache: stub });
    expect(q.report.overall).toBe(82);
    expect(q.report.grade).toBe("B");
  });

  it("never computes expensive metrics live in cached mode", () => {
    clearAnalyticsResolverCache();
    const view = buildKpiScorecardView({ cache: cachedMode() });
    const health = view.rows.find((r) => r.metric.id === "MET-DATA-HEALTH");
    expect(health).toBeDefined();
    if (health!.actual.value === null) {
      expect(health!.actual.notes.join(" ")).toMatch(/未計算/);
    } else {
      // Only the recorded snapshot may supply a value without a live scan.
      expect(health!.actual.source).toContain("snapshot-history.yaml");
      expect(health!.actual.notes.join(" ")).toMatch(/snapshot/);
    }
  });

  it("reports every open control gap, not a filtered subset", () => {
    const expected = computeControlGaps().length;
    const resolved = resolveMetricValue("compliance.controls.gap_count");
    expect(resolved.value).toBe(expected);
    expect(resolved.formatted).toBe(`${expected.toLocaleString("ja-JP")} 件`);
  });

  it("leaves month-over-month empty when no history is recorded", () => {
    const view = buildKpiScorecardView({ cache: cachedMode() });
    const recorded = new Set(loadSnapshotHistory().entries.map((e) => e.month));
    if (recorded.has(previousMonthLabel(view.as_of))) return;
    expect(view.rows.every((r) => r.prev_value === null)).toBe(true);
    expect(view.rows.every((r) => r.mom_delta === null)).toBe(true);
  });
});

describe("month-over-month arithmetic", () => {
  it("derives the previous calendar month across year boundaries", () => {
    expect(previousMonthLabel("2026-08-24")).toBe("2026-07");
    expect(previousMonthLabel("2026-01-05")).toBe("2025-12");
    expect(previousMonthLabel("2026-11-30")).toBe("2026-10");
  });

  it("returns null delta when either side is missing and null pct on zero baseline", () => {
    expect(computeMomDelta(null, 10)).toEqual({ delta: null, pct: null });
    expect(computeMomDelta(10, null)).toEqual({ delta: null, pct: null });
    expect(computeMomDelta(12, 10)).toEqual({ delta: 2, pct: 20 });
    expect(computeMomDelta(8, 10)).toEqual({ delta: -2, pct: -20 });
    expect(computeMomDelta(3, 0)).toEqual({ delta: 3, pct: null });
  });
});

describe("analytics snapshot history (isolated tenant)", () => {
  it("reads the previous month baseline from recorded history", () => {
    const tenant = setupTempAnalyticsTenant({
      snapshotHistory: [
        "version: 1",
        "entries:",
        '  - month: "2026-07"',
        "    values:",
        "      MET-DATA-HEALTH: 70",
        "",
      ].join("\n"),
    });
    try {
      const prev = getPreviousMonthValues("2026-08-15");
      expect(prev.get("MET-DATA-HEALTH")).toBe(70);
      expect(getPreviousMonthValues("2026-10-01").size).toBe(0);
    } finally {
      tenant.restore();
    }
  });

  it("writes under docs/analytics/snapshots and refuses silent history overwrite", () => {
    const tenant = setupTempAnalyticsTenant({ snapshotHistory: "version: 1\nentries: []\n" });
    try {
      const result = writeAnalyticsMonthlySnapshot({ asOf: "2026-08-24" });
      expect(result.month).toBe("2026-08");
      expect(result.path).toBe(join(getDocsDir(), "analytics", "snapshots", "2026-08.md"));
      expect(existsSync(result.path)).toBe(true);
      expect(loadSnapshotHistory().entries.map((e) => e.month)).toEqual(["2026-08"]);

      expect(() => writeAnalyticsMonthlySnapshot({ asOf: "2026-08-24" })).toThrow(/already exists/);
    } finally {
      tenant.restore();
    }
  });

  it("rejects backfilling a month that does not match the resolved values", () => {
    const tenant = setupTempAnalyticsTenant({ snapshotHistory: "version: 1\nentries: []\n" });
    try {
      expect(() =>
        writeAnalyticsMonthlySnapshot({ month: "2026-07", asOf: "2026-08-24" })
      ).toThrow(/--force/);
      expect(loadSnapshotHistory().entries).toHaveLength(0);
    } finally {
      tenant.restore();
    }
  });
});

describe("analytics kpi scorecard southwood", () => {
  it("returns empty rows when catalog absent", () => {
    setTenantId("southwood");
    const view = buildKpiScorecardView({ cache: cachedMode() });
    expect(Array.isArray(view.rows)).toBe(true);
  });
});
