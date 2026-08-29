import {
  handleSalesPipelineChatMessage,
  isSalesDetailRequest,
  isSalesPipelineChatIntent,
  looksLikeSalesPolicyRefusal,
  mentionsSalesDomain,
} from "../../steward-chat/sales-pipeline-intent.js";
import {
  formatSalesPipelineMarkdown,
  type SalesPipelineView,
} from "../../sales-pipeline-view.js";
import type { FactProvider, FactResult } from "../types.js";

export const salesPipelineProvider: FactProvider<SalesPipelineView | undefined> = {
  id: "sales_pipeline",
  toolName: "operator_sales_pipeline",
  description:
    "Deterministic sales pipeline KPIs (counts, weighted pipeline, alerts). L1 only — no contact details.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isSalesPipelineChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsSalesDomain(s),
  } as RegExp,
  ownerAgent: "sales_lead",
  escalate: {
    path: "data/sales/",
    routeBoost: "商談パイプライン · 見積方針 · 次アクション",
  },
  groundingLabel: "商談件数 / 加重パイプライン / 期限アラート",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeSalesPolicyRefusal,
  shouldEscalateDetail: isSalesDetailRequest,
  run(): FactResult<SalesPipelineView | undefined> {
    const result = handleSalesPipelineChatMessage("商談の状況は？");
    if (!result.handled || !result.view) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "営業KPIを取得できませんでした。",
        structuredKey: "sales_pipeline",
      };
    }
    return {
      ok: true,
      coverage: "registered",
      view: result.view,
      reply: result.reply ?? formatSalesPipelineMarkdown(result.view),
      structuredKey: "sales_pipeline",
    };
  },
  format(view) {
    if (!view) return "営業KPIなし";
    return formatSalesPipelineMarkdown(view);
  },
};
