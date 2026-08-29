import type { MetricDefinition } from "../../../schemas/analytics/index.js";
import { loadAnalyticsCatalog } from "./load.js";
import {
  computeMomDelta,
  getPreviousMonthValues,
  getRecordedValues,
  SNAPSHOT_HISTORY_REL,
} from "./snapshot-history.js";
import {
  createMetricResolverCache,
  evaluateMetricRag,
  resolveMetricValue,
  type MetricRag,
  type MetricResolverCache,
  type ResolvedMetricValue,
} from "./resolvers.js";
import { currentDate, formatCurrency, formatPercent } from "../utils.js";

export interface MetricCatalogRow {
  id: string;
  title: string;
  category: string;
  resolver: string;
  owner_agent: string;
  resolvable: boolean;
  sample_formatted: string;
  notes: string[];
}

export interface MetricCatalogView {
  company_name: string;
  as_of: string;
  catalog_path: string;
  metrics: MetricCatalogRow[];
  resolver_count: number;
  unresolved_count: number;
}

export function buildMetricCatalogView(opts?: { asOf?: string }): MetricCatalogView {
  const loaded = loadAnalyticsCatalog();
  const asOf = opts?.asOf ?? currentDate();
  const metrics: MetricCatalogRow[] = [];

  for (const def of loaded.catalog?.metrics ?? []) {
    const resolved = resolveMetricValue(def.resolver);
    const resolvable = resolved.value != null || resolved.notes.length === 0;
    metrics.push({
      id: def.id,
      title: def.title,
      category: def.category,
      resolver: def.resolver,
      owner_agent: def.owner_agent,
      resolvable,
      sample_formatted: resolved.formatted,
      notes: resolved.notes,
    });
  }

  return {
    company_name: "—",
    as_of: asOf,
    catalog_path: "data/analytics/metrics.yaml",
    metrics,
    resolver_count: metrics.length,
    unresolved_count: metrics.filter((m) => !m.resolvable).length,
  };
}

export function formatMetricCatalogMarkdown(view: MetricCatalogView): string {
  const lines = [
    `# メトリクスカタログ — ${view.as_of}`,
    "",
    `**正本:** \`${view.catalog_path}\` · **定義数:** ${view.resolver_count} · **未解決:** ${view.unresolved_count}`,
    "",
    "| id | 指標 | category | resolver | owner | 実測（resolver） |",
    "|----|------|----------|----------|-------|------------------|",
  ];
  for (const row of view.metrics) {
    lines.push(
      `| ${row.id} | ${row.title} | ${row.category} | ${row.resolver} | ${row.owner_agent} | ${row.sample_formatted} |`
    );
  }
  if (view.metrics.length === 0) {
    lines.push("| — | （定義なし） | — | — | — | — |");
  }
  return lines.join("\n") + "\n";
}

export interface KpiScorecardRow {
  metric: MetricDefinition;
  actual: ResolvedMetricValue;
  target_value: number | null;
  rag: MetricRag;
  delta: number | null;
  delta_pct: number | null;
  prev_value: number | null;
  mom_delta: number | null;
  mom_delta_pct: number | null;
}

export interface KpiScorecardView {
  company_name: string;
  as_of: string;
  fiscal_year: string;
  rows: KpiScorecardRow[];
  summary: { green: number; amber: number; red: number; unknown: number };
}

function formatDelta(row: KpiScorecardRow): string {
  if (row.delta == null) return "—";
  switch (row.metric.unit) {
    case "yen":
      return formatCurrency(row.delta);
    case "percent":
      return formatPercent(row.delta);
    case "months":
      return `${Math.round(row.delta * 10) / 10} ヶ月`;
    default:
      return `${Math.round(row.delta * 10) / 10}`;
  }
}

/**
 * When an expensive resolver is skipped (cached-only mode), fall back to the
 * value this month's snapshot already recorded rather than showing nothing.
 */
function applyRecordedFallback(
  resolved: ResolvedMetricValue,
  recorded: number | undefined,
  month: string
): ResolvedMetricValue {
  if (resolved.value != null || recorded == null) return resolved;
  return {
    ...resolved,
    value: recorded,
    formatted: String(recorded),
    source: `${SNAPSHOT_HISTORY_REL} · ${month}`,
    notes: [`snapshot ${month} の記録値`],
  };
}

export function buildKpiScorecardView(opts?: {
  asOf?: string;
  fiscalYear?: string;
  cache?: MetricResolverCache;
}): KpiScorecardView {
  const loaded = loadAnalyticsCatalog();
  const asOf = opts?.asOf ?? currentDate();
  const fiscalYear = opts?.fiscalYear ?? loaded.targets?.fiscal_year ?? "FY2026";
  const targetByMetric = new Map(
    (loaded.targets?.targets ?? []).map((t) => [t.metric_id, t.target_value])
  );
  const prevByMetric = getPreviousMonthValues(asOf);
  const cache = opts?.cache ?? createMetricResolverCache();
  const currentMonth = asOf.slice(0, 7);
  const recordedThisMonth = getRecordedValues(currentMonth);

  const rows: KpiScorecardRow[] = [];
  for (const metric of loaded.catalog?.metrics ?? []) {
    const actual = applyRecordedFallback(
      resolveMetricValue(metric.resolver, cache),
      recordedThisMonth.get(metric.id),
      currentMonth
    );
    const target = targetByMetric.get(metric.id) ?? null;
    const prev = prevByMetric.get(metric.id) ?? null;
    const delta =
      actual.value != null && target != null ? actual.value - target : null;
    const deltaPct =
      delta != null && target != null && target !== 0
        ? Math.round((delta / target) * 1000) / 10
        : null;
    const mom = computeMomDelta(actual.value, prev);
    const rag = evaluateMetricRag({
      direction: metric.direction,
      actual: actual.value,
      target,
      thresholdWarningPct: metric.threshold_warning_pct,
      thresholdCriticalPct: metric.threshold_critical_pct,
    });
    rows.push({
      metric,
      actual,
      target_value: target,
      rag,
      delta,
      delta_pct: deltaPct,
      prev_value: prev,
      mom_delta: mom.delta,
      mom_delta_pct: mom.pct,
    });
  }

  const summary = { green: 0, amber: 0, red: 0, unknown: 0 };
  for (const row of rows) {
    summary[row.rag] += 1;
  }

  return {
    company_name: "—",
    as_of: asOf,
    fiscal_year: fiscalYear,
    rows,
    summary,
  };
}

function formatMomDelta(row: KpiScorecardRow): string {
  if (row.mom_delta == null) return "—";
  const pct =
    row.mom_delta_pct != null ? ` (${row.mom_delta_pct > 0 ? "+" : ""}${row.mom_delta_pct}%)` : "";
  switch (row.metric.unit) {
    case "yen":
      return `${formatCurrency(row.mom_delta)}${pct}`;
    case "percent":
      return `${formatPercent(row.mom_delta)}${pct}`;
    default:
      return `${Math.round(row.mom_delta * 10) / 10}${pct}`;
  }
}

export function formatKpiScorecardMarkdown(view: KpiScorecardView): string {
  const lines = [
    `# KPI スコアカード — ${view.as_of}`,
    "",
    `**会計年度:** ${view.fiscal_year} · **RAG:** 🟢 ${view.summary.green} · 🟡 ${view.summary.amber} · 🔴 ${view.summary.red} · ? ${view.summary.unknown}`,
    "",
    "| RAG | id | 指標 | 実測 | 目標 | 差分 | 前月比 | owner |",
    "|-----|----|------|------|------|------|--------|-------|",
  ];
  const ragEmoji = { green: "🟢", amber: "🟡", red: "🔴", unknown: "?" } as const;
  for (const row of view.rows) {
    const target =
      row.target_value == null
        ? "—"
        : row.metric.unit === "yen"
          ? formatCurrency(row.target_value)
          : String(row.target_value);
    lines.push(
      `| ${ragEmoji[row.rag]} | ${row.metric.id} | ${row.metric.title} | ${row.actual.formatted} | ${target} | ${formatDelta(row)} | ${formatMomDelta(row)} | ${row.metric.owner_agent} |`
    );
  }
  if (view.rows.length === 0) {
    lines.push("| ? | — | （定義なし） | — | — | — | — | — |");
  }
  return lines.join("\n") + "\n";
}

export function formatKpiScorecardCeoReply(view: KpiScorecardView): string {
  const alerts = view.rows.filter((r) => r.rag === "red" || r.rag === "amber");
  if (view.rows.length === 0) {
    return "KPI カタログが未設定です（data/analytics/metrics.yaml）。";
  }
  const head = `KPI ${view.rows.length} 件（🟢${view.summary.green} 🟡${view.summary.amber} 🔴${view.summary.red}）`;
  if (alerts.length === 0) {
    return `${head}。閾値超過はありません。`;
  }
  const detail = alerts
    .slice(0, 4)
    .map((r) => `${r.metric.title}: ${r.actual.formatted}${r.target_value != null ? ` / 目標 ${r.target_value}` : ""}`)
    .join(" · ");
  return `${head}。要確認: ${detail}`;
}

export function buildAnalyticsExecutiveAlertLine(): string | null {
  const view = buildKpiScorecardView();
  const alerts = view.rows.filter((r) => r.rag === "red");
  if (alerts.length === 0) return null;
  const names = alerts.map((r) => r.metric.title).join(" · ");
  return `Analytics: KPI 閾値超過 ${alerts.length} 件（${names}）`;
}
