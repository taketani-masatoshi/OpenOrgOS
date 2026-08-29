import {
  handleSalesOutboundChatMessage,
  isSalesOutboundChatIntent,
  isSalesOutboundDetailRequest,
  looksLikeSalesOutboundPolicyRefusal,
  mentionsOutboundDomain,
} from "../../steward-chat/sales-outbound-intent.js";
import {
  formatSalesOutboundMarkdown,
  type SalesOutboundView,
} from "../../sales-outbound-view.js";
import type { FactProvider, FactResult } from "../types.js";

export const salesOutboundProvider: FactProvider<SalesOutboundView | undefined> = {
  id: "sales_outbound",
  toolName: "operator_sales_outbound",
  description:
    "Deterministic outbound campaign KPIs (counts, contact coverage, alerts). L1 only — no contact lists.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isSalesOutboundChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsOutboundDomain(s),
  } as RegExp,
  ownerAgent: "sales_outbound",
  escalate: {
    path: "data/sales/outbound/",
    routeBoost: "リスト精査 · 初回アプローチ · コールド outreach",
  },
  groundingLabel: "施策件数 / active / 接触率 / アラート",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeSalesOutboundPolicyRefusal,
  shouldEscalateDetail: isSalesOutboundDetailRequest,
  run(): FactResult<SalesOutboundView | undefined> {
    const result = handleSalesOutboundChatMessage("アウトバウンドの状況は？");
    if (!result.handled || !result.view) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "アウトバウンド施策 KPI を取得できませんでした。",
        structuredKey: "sales_outbound",
      };
    }
    return {
      ok: true,
      coverage: "registered",
      view: result.view,
      reply: result.reply ?? formatSalesOutboundMarkdown(result.view),
      structuredKey: "sales_outbound",
    };
  },
  format(view) {
    if (!view) return "アウトバウンド KPI なし";
    return formatSalesOutboundMarkdown(view);
  },
};
