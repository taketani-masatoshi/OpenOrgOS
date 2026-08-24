/**
 * Adapter — delegates to existing finance-metrics-intent (no logic move).
 */
import {
  handleFinanceMetricsChatMessage,
  isFinanceKpiTopic,
  isFinanceMetricsChatIntent,
  looksLikeFinancePolicyRefusal,
} from "../../steward-chat/finance-metrics-intent.js";
import type { FactProvider, FactResult } from "../types.js";

type FinanceView = NonNullable<
  ReturnType<typeof handleFinanceMetricsChatMessage>["metrics"]
>;

export const financeMetricsProvider: FactProvider<FinanceView | undefined> = {
  id: "finance_metrics",
  toolName: "operator_finance_metrics",
  description:
    "Deterministic finance KPIs (burn / runway / CF / revenue) from computeDashboard. L1 only.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isFinanceMetricsChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => isFinanceKpiTopic(s),
  } as RegExp,
  ownerAgent: "finance",
  escalate: {
    path: "data/finance/monthly/",
    routeBoost: "月次収支・予実差異の確認",
  },
  groundingLabel: "バーンレート / ランウェイ / CF / 売上・費用 / 経営ブリーフィング",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeFinancePolicyRefusal,
  run(args?: Record<string, unknown>): FactResult<FinanceView | undefined> {
    const message =
      typeof args?.message === "string" && args.message.trim()
        ? args.message
        : "バーンレート";
    const result = handleFinanceMetricsChatMessage(message);
    if (!result.handled) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "財務KPI intent に一致しません。",
        structuredKey: "finance_metrics",
      };
    }
    return {
      ok: result.ok !== false,
      coverage: result.ok === false ? "partial" : "registered",
      view: result.metrics,
      reply: result.reply,
      structuredKey: "finance_metrics",
    };
  },
  format(view) {
    if (!view) return "財務KPIなし";
    return JSON.stringify(view, null, 2);
  },
};
