import {
  buildIrBriefingView,
  formatIrCeoReply,
  type IrBriefingView,
} from "../../investor-relations/briefing-view.js";
import type { FactProvider, FactResult } from "../types.js";

const IR_INTENT =
  /(?:IR|株主|投資家|cap\s*table|キャップテーブル|開示(?:カレンダー|予定)?|説明会|株主総会|IR\s*briefing)/iu;

const IR_TOPIC = /IR|株主|投資家|cap table|開示カレンダー|説明会/iu;

const IR_REFUSAL =
  /investor-relations\/|data\/ir\/|IR Agent|決定論パス|ここにプラットフォーム|最新の株主数|\*\*XX\s*件\*\*/iu;

export const investorRelationsBriefingProvider: FactProvider<IrBriefingView> = {
  id: "investor_relations_briefing",
  toolName: "operator_ir_briefing",
  description:
    "Deterministic L1 IR briefing from data/investor-relations/ (cap table counts, disclosure window). No L2 contact values.",
  permission: "chat:read",
  intent: IR_INTENT,
  topic: IR_TOPIC,
  ownerAgent: "investor_relations",
  escalate: {
    path: "data/investor-relations/",
    routeBoost: "IR cap table · 開示カレンダー整備",
  },
  groundingLabel: "cap table / 開示予定 / IR 資料件数",
  escalateOnUnregistered: false,
  looksLikeRefusal: (reply) => IR_REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<IrBriefingView> {
    const view = buildIrBriefingView();
    return {
      ok: view.coverage !== "unregistered",
      coverage: view.coverage,
      view,
      structuredKey: "ir_briefing",
      reply: formatIrCeoReply(view),
    };
  },
  format: formatIrCeoReply,
};
