import {
  buildPmoPortfolioView,
  formatPmoCeoReply,
  type PmoPortfolioView,
} from "../../pmo/portfolio-view.js";
import type { FactProvider, FactResult } from "../types.js";

const PMO_INTENT =
  /(?:PMO)|ポートフォリオ|案件(?:状況|進捗|一覧)|プロジェクト(?:状況|進捗)|遅延案件|RAG.{0,8}(?:赤|red|案件)|今.{0,10}遅れ(?:てる|ている)?案件/iu;

const PMO_TOPIC =
  /PMO|ポートフォリオ|案件状況|案件進捗|遅延案件|プロジェクト状況/iu;

const PMO_REFUSAL =
  /portfolio\.yaml|data\/projects\/|Project Management Agent|PMOエージェント|決定論パス|ここにプラットフォーム|最新の案件数|\*\*XX\s*件\*\*|案件数は\s*\*\*XX|#\s*PMO ポートフォリオ/iu;

export const pmoPortfolioProvider: FactProvider<PmoPortfolioView> = {
  id: "pmo_portfolio",
  toolName: "operator_pmo_portfolio",
  description:
    "Deterministic L1 PMO portfolio from data/projects/ (RAG counts, overdue milestones). Never returns amounts or personal names.",
  permission: "chat:read",
  intent: PMO_INTENT,
  topic: PMO_TOPIC,
  ownerAgent: "project_management",
  escalate: {
    path: "data/projects/",
    routeBoost: "PMO ポートフォリオ整備（data/projects/）",
  },
  groundingLabel: "案件状況 / PMO ポートフォリオ / RAG",
  escalateOnUnregistered: false,
  looksLikeRefusal: (reply) => PMO_REFUSAL.test(reply.normalize("NFKC")),
  run(): FactResult<PmoPortfolioView> {
    const view = buildPmoPortfolioView();
    return {
      ok: view.coverage !== "unregistered",
      coverage: view.coverage,
      view,
      structuredKey: "pmo_portfolio",
      reply: formatPmoCeoReply(view),
    };
  },
  format: formatPmoCeoReply,
};
