/**
 * Analytics KPI dashboard — canvas-view compatible sections for Steward Chat.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import { buildKpiScorecardView } from "../../analytics/kpi-scorecard-view.js";
import {
  createMetricResolverCache,
  type ExpensiveResolverMode,
} from "../../analytics/resolvers.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

export interface AnalyticsDashboardPayload {
  view_model: CanvasViewModel;
  kpi: ReturnType<typeof buildKpiScorecardView>;
  /** null when the expensive data-health scan was skipped and never snapshotted. */
  data_quality_overall: number | null;
}

function resolveDataQualityOverall(
  kpi: ReturnType<typeof buildKpiScorecardView>
): number | null {
  const row = kpi.rows.find((r) => r.metric.resolver === "quality.data_health.overall");
  return row?.actual.value ?? null;
}

export function buildAnalyticsDashboardViewModel(opts?: {
  tenant?: string;
  reportDate?: string;
  updatedAt?: string;
  /** Precomputed scorecard — pass this to avoid recomputing the resolver stack. */
  kpi?: ReturnType<typeof buildKpiScorecardView>;
  expensive?: ExpensiveResolverMode;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const updatedAt = opts?.updatedAt?.trim() || `${currentDate()}T00:00:00+09:00`;
  const kpi =
    opts?.kpi ??
    buildKpiScorecardView({
      asOf: opts?.reportDate,
      cache: createMetricResolverCache({ expensive: opts?.expensive }),
    });
  const dataQuality = resolveDataQualityOverall(kpi);

  const ragEmoji = { green: "🟢", amber: "🟡", red: "🔴", unknown: "?" } as const;

  const kpiRows = kpi.rows.map((row) => {
    const target =
      row.target_value == null
        ? "—"
        : row.metric.unit === "yen"
          ? `${Math.round(row.target_value).toLocaleString("ja-JP")} 円`
          : String(row.target_value);
    const deltaCell =
      row.rag === "red"
        ? { text: row.actual.formatted, tone: "warning" as const }
        : row.rag === "green"
          ? { text: row.actual.formatted, tone: "success" as const }
          : { text: row.actual.formatted, tone: "neutral" as const };
    return [
      `${ragEmoji[row.rag]} ${row.metric.title}`,
      deltaCell,
      target,
      row.metric.category,
    ];
  });

  const barLabels = kpi.rows
    .filter((r) => r.actual.value != null && r.target_value != null && r.target_value > 0)
    .slice(0, 6)
    .map((r) => (r.metric.title.length > 8 ? `${r.metric.title.slice(0, 7)}…` : r.metric.title));
  const barActual = kpi.rows
    .filter((r) => r.actual.value != null && r.target_value != null && r.target_value > 0)
    .slice(0, 6)
    .map((r) => Math.max(0, Math.round(((r.actual.value ?? 0) / (r.target_value ?? 1)) * 100)));
  const barTarget = barLabels.map(() => 100);

  const sections: CanvasViewModel["sections"] = [
    {
      type: "stats",
      items: [
        {
          value: String(kpi.summary.green),
          label: "KPI 正常",
          tone: "success",
        },
        {
          value: String(kpi.summary.amber + kpi.summary.red),
          label: "要確認",
          tone: kpi.summary.red > 0 ? "warning" : "info",
        },
        {
          value: dataQuality == null ? "—" : `${dataQuality}`,
          label: "データ品質",
          tone: dataQuality != null && dataQuality >= 85 ? "success" : "warning",
        },
        {
          value: String(kpi.rows.length),
          label: "定義 KPI 数",
          tone: "info",
        },
      ],
    },
  ];

  if (barLabels.length > 0) {
    sections.push({
      type: "bars",
      title: "目標達成率（% · 先頭 6 指標）",
      categories: barLabels,
      series: [
        { name: "実績/目標%", data: barActual, tone: "info" },
        { name: "目標 100%", data: barTarget, tone: "neutral" },
      ],
    });
  }

  sections.push({
    type: "table",
    title: "KPI スコアカード",
    headers: ["指標", "実測", "目標", "category"],
    rows: kpiRows.length ? kpiRows : [["—", "—", "—", "—"]],
  });

  return {
    version: 1,
    tenant,
    suite: "executive",
    view_id: "analytics-dashboard",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "分析ダッシュボード",
    summary: `KPI ${kpi.rows.length} 件 · データ品質 ${dataQuality == null ? "—" : `${dataQuality}/100`}`,
    eyebrow: "Data & Analytics",
    subtitle: kpi.fiscal_year,
    sections,
    links: {
      present_cmd: "orgos analytics kpi",
      cursor_hint: "docs/analytics/",
    },
  };
}

export function buildAnalyticsDashboardPayload(opts?: {
  tenant?: string;
  reportDate?: string;
  /** HTTP callers pass "cached" so a request never triggers a minute-long scan. */
  expensive?: ExpensiveResolverMode;
}): AnalyticsDashboardPayload {
  const cache = createMetricResolverCache({ expensive: opts?.expensive });
  const kpi = buildKpiScorecardView({ asOf: opts?.reportDate, cache });
  const payload: AnalyticsDashboardPayload = {
    view_model: buildAnalyticsDashboardViewModel({ ...opts, kpi }),
    kpi,
    data_quality_overall: resolveDataQualityOverall(kpi),
  };
  assertAnalyticsDashboardNoL2(payload);
  return payload;
}

const L2_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "bank account", re: /口座番号|普通預金\s*\d|\b\d{7}\b(?=\s*(口座|支店))/ },
  { label: "email address", re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { label: "postal address", re: /〒\s?\d{3}-?\d{4}/ },
  { label: "phone number", re: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/ },
  { label: "absolute workspace path", re: /(^|["\s])\/?(?:Users|home)\/|tenants\/[a-z0-9_-]+\// },
];

/** Anything crossing the BFF boundary must stay L1. Applies to the whole payload. */
export function assertAnalyticsDashboardNoL2(payload: unknown): void {
  const blob = JSON.stringify(payload);
  if (!blob) return;
  for (const { label, re } of L2_PATTERNS) {
    if (re.test(blob)) {
      throw new Error(`analytics-dashboard payload contains ${label} (L2) — blocked`);
    }
  }
}
