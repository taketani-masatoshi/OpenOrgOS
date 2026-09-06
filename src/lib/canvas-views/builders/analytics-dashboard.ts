/**
 * Analytics KPI dashboard — canvas-view compatible sections for Steward Chat.
 * Console primary surface is snapshot-history (ADR 0046); live KPI is secondary.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import {
  annualSnapshotFileSchema,
  snapshotHistoryFileSchema,
} from "../../../../schemas/analytics/metric-catalog.js";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { readAgentSummaryBody } from "../../agent-inbox.js";
import { buildKpiScorecardView } from "../../analytics/kpi-scorecard-view.js";
import {
  createMetricResolverCache,
  evaluateMetricRag,
  type ExpensiveResolverMode,
} from "../../analytics/resolvers.js";
import { getWorkspaceRoot } from "../../orgos-paths.js";
import { getTenantId } from "../../tenant.js";
import { currentDate, getDataDir, getDocsDir, readYamlFile } from "../../utils.js";
import type { StaticReportSlot } from "../../static-report-slot.js";
import { emptyStaticReportSlot } from "../../static-report-slot.js";

const HINT_SNAPSHOT = "orgos analytics snapshot";
const MONTHLY_MD = /^(\d{4}-\d{2})\.md$/;

export interface AnalyticsDashboardPayload {
  view_model: CanvasViewModel;
  kpi: ReturnType<typeof buildKpiScorecardView>;
  /** null when the expensive data-health scan was skipped and never snapshotted. */
  data_quality_overall: number | null;
  annual_snapshot: {
    fiscal_year: string;
    as_of: string;
    months_recorded: number;
    metric_count: number;
  } | null;
  monthly_snapshots: Array<{
    month: string;
    metric_count: number;
    compared_count: number;
    attention_count: number;
  }>;
  annual_snapshots: Array<{
    fiscal_year: string;
    as_of: string;
    months_recorded: number;
    metric_count: number;
  }>;
  generate_hint: string;
  /** Optional foldable MD from docs/analytics/snapshots/*.md */
  latest_md: StaticReportSlot;
}

function resolveAnnualSnapshots(): AnalyticsDashboardPayload["annual_snapshots"] {
  const path = join(getDataDir(), "analytics", "annual-snapshots.yaml");
  if (!existsSync(path)) return [];
  const file = readYamlFile(path, annualSnapshotFileSchema);
  return file.entries
    .map((entry) => ({
      fiscal_year: entry.fiscal_year,
      as_of: entry.as_of,
      months_recorded: entry.months.length,
      metric_count: Object.keys(entry.values).length,
    }))
    .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year));
}

function previousMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, value! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolveMonthlySnapshots(
  kpi: ReturnType<typeof buildKpiScorecardView>
): AnalyticsDashboardPayload["monthly_snapshots"] {
  const path = join(getDataDir(), "analytics", "snapshot-history.yaml");
  if (!existsSync(path)) return [];
  const file = readYamlFile(path, snapshotHistoryFileSchema);
  const byMonth = new Map(file.entries.map((entry) => [entry.month, entry]));
  const rowsById = new Map(kpi.rows.map((row) => [row.metric.id, row]));
  return file.entries
    .map((entry) => {
      const previous = byMonth.get(previousMonth(entry.month));
      let attentionCount = 0;
      for (const [metricId, actual] of Object.entries(entry.values)) {
        const row = rowsById.get(metricId);
        if (!row) continue;
        const rag = evaluateMetricRag({
          direction: row.metric.direction,
          actual,
          target: row.target_value,
          thresholdWarningPct: row.metric.threshold_warning_pct,
          thresholdCriticalPct: row.metric.threshold_critical_pct,
        });
        if (rag === "amber" || rag === "red") attentionCount += 1;
      }
      return {
        month: entry.month,
        metric_count: Object.keys(entry.values).length,
        compared_count: previous
          ? Object.keys(entry.values).filter((metricId) => previous.values[metricId] !== undefined)
              .length
          : 0,
        attention_count: attentionCount,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

function loadLatestAnalyticsSnapshotMd(): StaticReportSlot {
  const absDir = join(getDocsDir(), "analytics", "snapshots");
  if (!existsSync(absDir)) {
    return emptyStaticReportSlot("月次 KPI スナップショット", HINT_SNAPSHOT);
  }
  const files: Array<{ asOf: string; abs: string; name: string }> = [];
  for (const name of readdirSync(absDir, { withFileTypes: true })) {
    if (!name.isFile()) continue;
    const m = name.name.match(MONTHLY_MD);
    if (!m) continue;
    files.push({ asOf: m[1]!, abs: join(absDir, name.name), name: name.name });
  }
  files.sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
  const latest = files[0];
  if (!latest) {
    return emptyStaticReportSlot("月次 KPI スナップショット", HINT_SNAPSHOT);
  }
  const repoRel = relative(getWorkspaceRoot(), latest.abs).replace(/\\/g, "/");
  // Prefer docs/-relative path so L2 path guard does not treat tenants/{id}/ as leakage.
  const docsRel = (() => {
    const marker = "/docs/";
    const idx = repoRel.indexOf(marker);
    if (idx >= 0) return `docs/${repoRel.slice(idx + marker.length)}`;
    return repoRel.startsWith("docs/") ? repoRel : `docs/analytics/snapshots/${latest.name}`;
  })();
  try {
    const markdown = readAgentSummaryBody(docsRel);
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    return {
      path: docsRel,
      title: titleMatch?.[1]?.trim() || `KPI スナップショット — ${latest.asOf}`,
      as_of: latest.asOf,
      markdown,
      generate_hint: HINT_SNAPSHOT,
    };
  } catch {
    return emptyStaticReportSlot("月次 KPI スナップショット", HINT_SNAPSHOT);
  }
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
      present_cmd: HINT_SNAPSHOT,
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
  const annualSnapshots = resolveAnnualSnapshots();
  const payload: AnalyticsDashboardPayload = {
    view_model: buildAnalyticsDashboardViewModel({ ...opts, kpi }),
    kpi,
    data_quality_overall: resolveDataQualityOverall(kpi),
    annual_snapshot:
      annualSnapshots.find((snapshot) => snapshot.fiscal_year === kpi.fiscal_year) ?? null,
    monthly_snapshots: resolveMonthlySnapshots(kpi),
    annual_snapshots: annualSnapshots,
    generate_hint: HINT_SNAPSHOT,
    latest_md: loadLatestAnalyticsSnapshotMd(),
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
