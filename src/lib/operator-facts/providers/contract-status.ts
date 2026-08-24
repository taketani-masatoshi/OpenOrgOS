import {
  handleContractStatusChatMessage,
  isContractDetailRequest,
  isContractStatusChatIntent,
  looksLikeContractPolicyRefusal,
  mentionsContractDomain,
} from "../../steward-chat/contract-status-intent.js";
import {
  formatContractStatusMarkdown,
  type ContractStatusView,
} from "../../contract-status-view.js";
import type { FactProvider, FactResult } from "../types.js";

export const contractStatusProvider: FactProvider<ContractStatusView | undefined> = {
  id: "contract_status",
  toolName: "operator_contract_status",
  description:
    "Deterministic contract portfolio KPIs (counts, expiry, exit windows). L1 only — no contract body.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isContractStatusChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsContractDomain(s),
  } as RegExp,
  ownerAgent: "contract",
  escalate: {
    path: "data/contracts/",
    routeBoost: "契約台帳・期限・退出窓の確認",
  },
  groundingLabel: "契約本数 / 期限アラート / 解約・退出窓",
  escalateOnUnregistered: false,
  looksLikeRefusal: looksLikeContractPolicyRefusal,
  shouldEscalateDetail: isContractDetailRequest,
  run(): FactResult<ContractStatusView | undefined> {
    const result = handleContractStatusChatMessage("契約本数を教えて");
    if (!result.handled || !result.view) {
      return {
        ok: false,
        coverage: "unregistered",
        view: undefined,
        reply: "契約KPIを取得できませんでした。",
        structuredKey: "contract_status",
      };
    }
    return {
      ok: true,
      coverage: "registered",
      view: result.view,
      reply: result.reply ?? formatContractStatusMarkdown(result.view),
      structuredKey: "contract_status",
    };
  },
  format(view) {
    if (!view) return "契約KPIなし";
    return formatContractStatusMarkdown(view);
  },
};
