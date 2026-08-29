import {
  buildCashCounterpartiesView,
  formatCashCounterpartiesCeoReply,
  type CashCounterpartiesView,
} from "../../cash-counterparties-view.js";
import type { FactProvider, FactResult } from "../types.js";

const AGENT_HANDOFF =
  /(?:Finance|ファイナンス|財務|Contract|契約エージェント|Compliance|コンプライアンス|コンプラ|Operations|オペレーション|秘書|Secretary|Legal|リーガル|人事|HR|Human\s*Resources|労務)(?:\s*(?:エージェント|Agent|agent))?.{0,8}(?:に|へ).{0,20}(?:確認|照会|依頼|委譲)/iu;

const LISTISH = /一覧|リスト|提示|教えて|出して|誰|相手/;
const PARTY = /取引先|得意先|仕入先|支払先|振込先|入出金|counterparty/iu;
const CASH_PARTY = /(?:入金|出金).{0,20}(?:相手|先)|(?:相手|先).{0,12}(?:入金|出金)/u;

export function isCashCounterpartiesChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!n) return false;
  if (AGENT_HANDOFF.test(n)) return false;
  if (/(?:資金繰り表|契約本数|条項|本文)/u.test(n)) return false;
  if (/商談|パイプライン|見積/u.test(n) && !/(?:入金|出金)/u.test(n)) return false;
  if (PARTY.test(n) && LISTISH.test(n)) return true;
  return CASH_PARTY.test(n);
}

export function mentionsCashCounterpartiesTopic(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (AGENT_HANDOFF.test(n)) return false;
  return PARTY.test(n) || CASH_PARTY.test(n);
}

const REFUSAL =
  /(?:取引先|入出金|counterparty).{0,40}(?:確認できません|参照できません|アクセスできません)|専用の\s*(?:Contract|Finance)\s*Agent/iu;

export const cashCounterpartiesProvider: FactProvider<CashCounterpartiesView> = {
  id: "cash_counterparties",
  toolName: "operator_cash_counterparties",
  description:
    "Deterministic L1 cash counterparties from AR/AP and bank statements. Names only — no account numbers.",
  permission: "chat:read",
  intent: {
    test: (s: string) => isCashCounterpartiesChatIntent(s),
  } as RegExp,
  topic: {
    test: (s: string) => mentionsCashCounterpartiesTopic(s),
  } as RegExp,
  ownerAgent: "finance",
  escalate: {
    path: "data/finance/ar-ap-ledger.yaml",
    routeBoost: "入出金相手（売掛・買掛・通帳）の確認",
  },
  groundingLabel: "入出金相手 / 取引先一覧（売掛・買掛・通帳）",
  escalateOnUnregistered: false,
  looksLikeRefusal: (reply) => REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<CashCounterpartiesView> {
    const view = buildCashCounterpartiesView();
    return {
      ok: view.coverage === "registered",
      coverage: view.coverage,
      view,
      structuredKey: "cash_counterparties",
      reply: formatCashCounterpartiesCeoReply(view),
    };
  },
  format: formatCashCounterpartiesCeoReply,
};
