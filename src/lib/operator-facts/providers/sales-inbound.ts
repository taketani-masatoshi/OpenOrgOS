import {
  handleSalesInboundChatMessage,
  isSalesInboundChatIntent,
  isSalesInboundDetailRequest,
  looksLikeSalesInboundPolicyRefusal,
  mentionsInboundDomain,
} from "../../steward-chat/sales-inbound-intent.js";
import {
  formatSalesInboundMarkdown,
  type SalesInboundView,
} from "../../sales-inbound-view.js";
import type { FactProvider, FactResult } from "../types.js";

export const salesInboundProvider: FactProvider<SalesInboundView | undefined> = {
  id: "sales_inbound",
  toolName: "operator_sales_inbound",
  description:
    "Deterministic inbound inquiry KPIs (counts, SLA alerts, awaiting response). L1 only — no contact details.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isSalesInboundChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsInboundDomain(s),
  } as RegExp,
  ownerAgent: "sales_inbound",
  escalate: {
    path: "data/sales/inbound/",
    routeBoost: "問合せトリアージ · 初回回答 · 提携案件",
  },
  groundingLabel: "問合せ件数 / 未対応 / 初動 SLA アラート",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeSalesInboundPolicyRefusal,
  shouldEscalateDetail: isSalesInboundDetailRequest,
  run(): FactResult<SalesInboundView | undefined> {
    const result = handleSalesInboundChatMessage("問合せの状況は？");
    if (!result.handled || !result.view) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "インバウンド問合せ KPI を取得できませんでした。",
        structuredKey: "sales_inbound",
      };
    }
    return {
      ok: true,
      coverage: "registered",
      view: result.view,
      reply: result.reply ?? formatSalesInboundMarkdown(result.view),
      structuredKey: "sales_inbound",
    };
  },
  format(view) {
    if (!view) return "問合せ KPI なし";
    return formatSalesInboundMarkdown(view);
  },
};
