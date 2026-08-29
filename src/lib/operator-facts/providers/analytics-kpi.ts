import {
  buildKpiScorecardView,
  formatKpiScorecardCeoReply,
  type KpiScorecardView,
} from "../../analytics/kpi-scorecard-view.js";
import { createMetricResolverCache } from "../../analytics/resolvers.js";
import type { FactProvider, FactResult } from "../types.js";

/**
 * Deliberately narrower than "指標": finance owns burn / runway / 経営指標 wording,
 * so matching must not depend on provider order in the registry.
 */
const KPI_INTENT =
  /KPI|スコアカード|scorecard|メトリクス|指標一覧|目標.{0,8}実績|analytics.{0,8}kpi/iu;

const KPI_TOPIC = /KPI|スコアカード|メトリクス|analytics|data.analytics|指標一覧|目標値/iu;

const KPI_REFUSAL =
  /metrics\.yaml|data\/analytics\/|Analytics Agent|決定論パス|ここにプラットフォーム|最新のKPI|正確なKPI/iu;

export const analyticsKpiProvider: FactProvider<KpiScorecardView> = {
  id: "analytics_kpi",
  toolName: "operator_analytics_kpi",
  description:
    "Deterministic KPI scorecard from data/analytics/metrics.yaml + resolver-backed actuals.",
  permission: "chat:read",
  intent: KPI_INTENT,
  topic: KPI_TOPIC,
  ownerAgent: "data_analytics",
  escalate: {
    path: "data/analytics/",
    routeBoost: "KPI カタログ整備（metrics.yaml · kpi-targets.yaml）",
  },
  groundingLabel: "KPI スコアカード / analytics kpi",
  escalateOnUnregistered: false,
  looksLikeRefusal: (reply) => KPI_REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<KpiScorecardView> {
    // Chat runs in the long-lived server: never trigger a full-tenant scan here.
    const view = buildKpiScorecardView({
      cache: createMetricResolverCache({ expensive: "cached" }),
    });
    const ok = view.rows.length > 0;
    return {
      ok,
      coverage: ok ? "registered" : "unregistered",
      view,
      structuredKey: "analytics_kpi",
      reply: formatKpiScorecardCeoReply(view),
    };
  },
  format: formatKpiScorecardCeoReply,
};
