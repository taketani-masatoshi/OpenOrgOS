import type { MetricResolverId } from "../../../schemas/analytics/index.js";
import { computeControlGaps } from "../control-framework.js";
import { computeDataHealth } from "../data-health.js";
import { computeDashboard } from "../dashboard.js";
import { buildHeadcountView } from "../hr/headcount-view.js";
import { computeMaturityReport } from "../maturity.js";
import { computeOs99Score } from "../os-score.js";
import { getTenantId } from "../tenant.js";
import { computeVarianceReport } from "../variance.js";

export type MetricRag = "green" | "amber" | "red" | "unknown";

export interface ResolvedMetricValue {
  resolver: MetricResolverId;
  value: number | null;
  formatted: string;
  source: string;
  notes: string[];
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

function formatCount(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}`;
}

function formatPercent(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

function formatMonths(n: number): string {
  return `${Math.round(n * 10) / 10} ヶ月`;
}

function memo<T>(fn: () => T): () => T {
  let cached: { value: T } | undefined;
  return () => {
    cached ??= { value: fn() };
    return cached.value;
  };
}

/**
 * computeDataHealth and the maturity/OS-score pair each scan the whole tenant
 * (tens of seconds on mal). A long-lived BFF must not redo that per request, so
 * they are memoized per tenant with a TTL. A CLI process exits before the TTL
 * matters, so `orgos analytics` still reads fresh state on every invocation.
 */
const SHARED_TTL_MS = Number(process.env.ORGOS_ANALYTICS_CACHE_TTL_MS ?? 300_000);
const sharedCache = new Map<string, { value: unknown; at: number }>();

/**
 * `live` computes on miss (CLI, pipeline). `cached` never computes, so a
 * long-lived server never blocks its event loop for a minute; callers fall back
 * to the recorded snapshot instead.
 */
export type ExpensiveResolverMode = "live" | "cached";

function sharedMemo<T>(key: string, fn: () => T, mode: ExpensiveResolverMode): () => T | undefined {
  return () => {
    const cacheKey = `${getTenantId()}:${key}`;
    const hit = sharedCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SHARED_TTL_MS) return hit.value as T;
    if (mode === "cached") return undefined;
    const value = fn();
    sharedCache.set(cacheKey, { value, at: Date.now() });
    return value;
  };
}

export function clearAnalyticsResolverCache(): void {
  sharedCache.clear();
}

/**
 * One catalog build touches the same expensive computations several times
 * (dashboard feeds three metrics). Share them across a single build.
 */
export interface MetricResolverCache {
  dashboard: () => ReturnType<typeof computeDashboard>;
  dataHealth: () => ReturnType<typeof computeDataHealth> | undefined;
  osScore: () => ReturnType<typeof computeOs99Score> | undefined;
  headcount: () => ReturnType<typeof buildHeadcountView>;
  controlGaps: () => ReturnType<typeof computeControlGaps>;
  variance: () => ReturnType<typeof computeVarianceReport>;
}

export function createMetricResolverCache(opts?: {
  expensive?: ExpensiveResolverMode;
}): MetricResolverCache {
  const mode = opts?.expensive ?? "live";
  return {
    dashboard: memo(() => computeDashboard()),
    dataHealth: sharedMemo("data_health", () => computeDataHealth(), mode),
    osScore: sharedMemo("os_score", () => computeOs99Score(computeMaturityReport()), mode),
    headcount: memo(() => buildHeadcountView()),
    controlGaps: memo(() => computeControlGaps()),
    variance: memo(() => computeVarianceReport()),
  };
}

const NOT_COMPUTED_NOTE = "未計算（orgos analytics snapshot で更新）";

export function resolveMetricValue(
  resolver: MetricResolverId,
  cache: MetricResolverCache = createMetricResolverCache()
): ResolvedMetricValue {
  const notes: string[] = [];

  switch (resolver) {
    case "finance.dashboard.cash_balance": {
      const dash = cache.dashboard();
      const v = dash.cashFlow.cashBalance;
      return {
        resolver,
        value: v,
        formatted: v == null ? "—" : formatYen(v),
        source: "src/lib/dashboard.ts · computeDashboard",
        notes: dash.cashFlow.notes.slice(0, 2),
      };
    }
    case "finance.dashboard.runway_months": {
      const dash = cache.dashboard();
      const v = dash.cashFlow.runwayMonths;
      return {
        resolver,
        value: v,
        formatted: v == null ? "—" : formatMonths(v),
        source: "src/lib/dashboard.ts · computeDashboard",
        notes,
      };
    }
    case "finance.dashboard.monthly_profit": {
      const dash = cache.dashboard();
      const v = dash.cashFlow.monthlyProfit;
      return {
        resolver,
        value: v,
        formatted: formatYen(v),
        source: "src/lib/dashboard.ts · computeDashboard",
        notes: [`basis ${dash.cashFlow.basisMonth}`],
      };
    }
    case "finance.variance.revenue_delta_pct": {
      try {
        const vReport = cache.variance();
        const pct =
          vReport.planTotal !== 0
            ? Math.round((vReport.deltaTotal / vReport.planTotal) * 1000) / 10
            : null;
        return {
          resolver,
          value: pct,
          formatted: pct == null ? "—" : formatPercent(pct),
          source: "src/lib/variance.ts · computeVarianceReport",
          notes: [`FY ${vReport.fiscalYear}`],
        };
      } catch (e) {
        notes.push(e instanceof Error ? e.message : String(e));
        return {
          resolver,
          value: null,
          formatted: "—",
          source: "src/lib/variance.ts · computeVarianceReport",
          notes,
        };
      }
    }
    case "hr.headcount.on_roster": {
      const view = cache.headcount();
      return {
        resolver,
        value: view.on_roster,
        formatted: `${formatCount(view.on_roster)} 名`,
        source: "src/lib/hr/headcount-view.ts · buildHeadcountView",
        notes: view.coverage === "unregistered" ? ["HR 未登録"] : [],
      };
    }
    case "compliance.controls.gap_count": {
      // computeControlGaps() returns gap rows only — every row is an open gap.
      const gaps = cache.controlGaps();
      const byType = new Map<string, number>();
      for (const gap of gaps) {
        byType.set(gap.gap_type, (byType.get(gap.gap_type) ?? 0) + 1);
      }
      return {
        resolver,
        value: gaps.length,
        formatted: `${formatCount(gaps.length)} 件`,
        source: "src/lib/control-framework.ts · computeControlGaps",
        notes: [...byType.entries()].map(([type, count]) => `${type}: ${count}`).slice(0, 3),
      };
    }
    case "quality.data_health.overall": {
      const health = cache.dataHealth();
      if (!health) {
        return {
          resolver,
          value: null,
          formatted: "—",
          source: "src/lib/data-health.ts · computeDataHealth",
          notes: [NOT_COMPUTED_NOTE],
        };
      }
      return {
        resolver,
        value: health.overall,
        formatted: `${formatCount(health.overall)} / 100 (${health.grade})`,
        source: "src/lib/data-health.ts · computeDataHealth",
        notes: health.recommendations.slice(0, 2),
      };
    }
    case "os_score.composite": {
      const score = cache.osScore();
      if (!score) {
        return {
          resolver,
          value: null,
          formatted: "—",
          source: "src/lib/os-score.ts · computeOs99Score",
          notes: [NOT_COMPUTED_NOTE],
        };
      }
      return {
        resolver,
        value: score.composite,
        formatted: `${formatCount(score.composite)} / 100 (${score.grade})`,
        source: "src/lib/os-score.ts · computeOs99Score",
        notes: score.gaps.slice(0, 2),
      };
    }
    default: {
      const _exhaustive: never = resolver;
      return {
        resolver: _exhaustive,
        value: null,
        formatted: "—",
        source: "unknown",
        notes: ["unknown resolver"],
      };
    }
  }
}

export function evaluateMetricRag(opts: {
  direction: "higher_better" | "lower_better" | "neutral";
  actual: number | null;
  target: number | null;
  thresholdWarningPct?: number;
  thresholdCriticalPct?: number;
}): MetricRag {
  const { actual, target, direction } = opts;
  if (actual == null || target == null) return "unknown";
  if (direction === "neutral") {
    const warn = opts.thresholdWarningPct ?? 10;
    const crit = opts.thresholdCriticalPct ?? 20;
    const deltaPct = target !== 0 ? Math.abs((actual - target) / target) * 100 : Math.abs(actual - target);
    if (deltaPct >= crit) return "red";
    if (deltaPct >= warn) return "amber";
    return "green";
  }

  if (target === 0) {
    if (direction === "lower_better") return actual <= 0 ? "green" : "red";
    return actual >= 0 ? "green" : "red";
  }

  const ratio = actual / target;
  const warn = (opts.thresholdWarningPct ?? 10) / 100;
  const crit = (opts.thresholdCriticalPct ?? 20) / 100;

  if (direction === "higher_better") {
    if (ratio < 1 - crit) return "red";
    if (ratio < 1 - warn) return "amber";
    return "green";
  }

  // lower_better
  if (ratio > 1 + crit) return "red";
  if (ratio > 1 + warn) return "amber";
  return "green";
}

export const METRIC_RESOLVER_IDS: MetricResolverId[] = [
  "finance.dashboard.cash_balance",
  "finance.dashboard.runway_months",
  "finance.dashboard.monthly_profit",
  "finance.variance.revenue_delta_pct",
  "hr.headcount.on_roster",
  "compliance.controls.gap_count",
  "quality.data_health.overall",
  "os_score.composite",
];
