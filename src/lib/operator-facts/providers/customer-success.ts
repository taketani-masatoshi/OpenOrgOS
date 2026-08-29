import {
  handleCustomerSuccessChatMessage,
  isCustomerSuccessChatIntent,
  isCustomerSuccessDetailRequest,
  looksLikeCustomerSuccessPolicyRefusal,
  mentionsCustomerSuccessDomain,
} from "../../steward-chat/customer-success-intent.js";
import {
  formatCustomerSuccessMarkdown,
  type CustomerSuccessView,
} from "../../customer-success-view.js";
import type { FactProvider, FactResult } from "../types.js";

export const customerSuccessProvider: FactProvider<CustomerSuccessView | undefined> = {
  id: "customer_success",
  toolName: "operator_customer_success",
  description:
    "Deterministic customer success KPIs (health, renewals, drift, NPS). L1 only — no contact details.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isCustomerSuccessChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsCustomerSuccessDomain(s),
  } as RegExp,
  ownerAgent: "customer_success",
  escalate: {
    path: "data/customers/",
    routeBoost: "顧客ヘルス · 更新期日 · 解約防止 · QBR",
  },
  groundingLabel: "顧客数 / ヘルス / 更新期日 / drift",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeCustomerSuccessPolicyRefusal,
  shouldEscalateDetail: isCustomerSuccessDetailRequest,
  run(): FactResult<CustomerSuccessView | undefined> {
    const result = handleCustomerSuccessChatMessage("顧客の状況は？");
    if (!result.handled || !result.view) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "顧客KPIを取得できませんでした。",
        structuredKey: "customer_success",
      };
    }
    return {
      ok: true,
      coverage: "registered",
      view: result.view,
      reply: result.reply ?? formatCustomerSuccessMarkdown(result.view, { showScores: false }),
      structuredKey: "customer_success",
    };
  },
  format(view) {
    if (!view) return "顧客KPIなし";
    return formatCustomerSuccessMarkdown(view, { showScores: false });
  },
};
