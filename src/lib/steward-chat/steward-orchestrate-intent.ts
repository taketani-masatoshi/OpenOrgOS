import { runEscalation } from "../escalate.js";
import { getTenantId } from "../tenant.js";
import { loadCompany } from "../data.js";
import {
  formatSecretaryConsultCeoReply,
  isSecretaryMandate,
} from "../agent-owner-desks.js";

export interface StewardOrchestrateResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  work_order_ids?: string[];
}

/**
 * Explicit Steward orchestration — create a real Work Order (no LLM role-play).
 * Matches department Agent 確認 / 委譲 / IMP 起票. Does not invent Skill results.
 *
 * Root cause fix: previously only Finance-named phrases matched; Contract / Compliance /
 * Operations were prepared in inferRouteHints but never triggered from Web UI.
 */
const ORCHESTRATE_INTENT =
  /(?:(?:Finance|ファイナンス|財務|Contract|契約|Compliance|コンプライアンス|コンプラ|Operations|オペレーション|秘書|Secretary|Legal|リーガル|人事|HR|Human\s*Resources|労務)(?:\s*(?:エージェント|Agent|agent))?|(?:他の?エージェント|部門エージェント)).{0,24}(?:に|へ).{0,20}(?:確認|照会|依頼|聞いて|聞い|調査|委譲|提示)|(?:契約書|契約).{0,16}(?:条項|本文|詳細).{0,12}(?:確認|レビュー|読んで|調査)|(?:Work\s*Order|ワーク\s*オーダー|IMP).{0,8}(?:を)?(?:作|起票|作成)|(?:委譲して|オーケストレ(?:ート)?して?)/iu;

const AGENT_LABEL: Record<string, string> = {
  contract: "契約",
  finance: "財務",
  human_resources: "人事",
  compliance: "コンプライアンス",
  operations: "オペレーション",
  secretary: "秘書",
  executive_steward: "スチュワード",
  corporate_governance: "ガバナンス",
};

function agentLabel(id: string): string {
  return AGENT_LABEL[id] ?? id;
}

/** CEO-facing Work Order receipt — no CLI, Path, or implementation lecture. */
export function formatStewardOrchestrateCeoReply(input: {
  ok: boolean;
  rootId?: string;
  agentIds: string[];
}): string {
  if (!input.ok || !input.rootId || input.agentIds.length === 0) {
    return "担当が見つからず、確認依頼を出せませんでした。部門名を指定して再依頼してください。";
  }
  const labels = [...new Set(input.agentIds.map(agentLabel))];
  const who = labels.join("・");
  return [
    `${who}担当に確認を依頼しました（受付 ${input.rootId}）。`,
    "結果は「委譲と回答」に届きます。",
  ].join("\n");
}

export function isStewardOrchestrateIntent(message: string): boolean {
  return ORCHESTRATE_INTENT.test(message.normalize("NFKC").trim());
}

function inferRouteHints(message: string): { path?: string; routeBoost: string } {
  const n = message.normalize("NFKC");
  if (/財務|Finance|バーン|キャッシュ|予実|資金|ランウェイ|納税/i.test(n)) {
    return {
      path: "data/finance/monthly/",
      routeBoost: "月次収支・予実差異の確認",
    };
  }
  if (/契約|Contract|CTR-|解約|期限アラート|リーガル|Legal|取引先|得意先|仕入先|counterparty/i.test(n)) {
    return { path: "data/contracts/", routeBoost: "契約台帳・取引先・期限・退出窓の確認" };
  }
  if (/人事|HR|Human\s*Resources|労務|従業員|社員|人員|在籍|headcount/i.test(n)) {
    return { path: "data/hr/", routeBoost: "人事・在籍人員の確認" };
  }
  if (/コンプラ|許認可|Compliance/i.test(n)) {
    return { path: "data/classification-registry.yaml", routeBoost: "コンプライアンス確認" };
  }
  if (/オペレーション|Operations|物件|property/i.test(n)) {
    return { path: "data/properties/", routeBoost: "オペレーション・物件確認" };
  }
  if (/実装|コード|バグ|src\//i.test(n)) {
    return { path: "src/", routeBoost: "実装・プラットフォーム確認" };
  }
  return { routeBoost: "" };
}

/**
 * Steward automatically files an implement Work Order and reports real IMP ids.
 */
export function handleStewardOrchestrateChatMessage(
  message: string,
  opts?: { fromAgent?: string; force?: boolean; path?: string; routeBoost?: string }
): StewardOrchestrateResult {
  if (!opts?.force && !isStewardOrchestrateIntent(message)) return { handled: false };

  const company = loadCompany();
  const subject = message.replace(/\s+/g, " ").trim().slice(0, 120);
  const hints = inferRouteHints(message);
  const path = opts?.path ?? hints.path;
  const routeBoost = opts?.routeBoost ?? hints.routeBoost;
  const requirements = [message.trim(), routeBoost ? `（${routeBoost}）` : ""]
    .filter(Boolean)
    .join("\n");
  const result = runEscalation({
    fromAgent: opts?.fromAgent ?? "executive_steward",
    tenant: getTenantId(),
    input: {
      subject: subject || `${company.name} への確認依頼`,
      background: `Steward Chat からの自動オーケストレーション（${company.name}）`,
      requirements,
      path,
      text: requirements,
      priority: "P2",
      tenant: getTenantId(),
    },
  });

  const workOrders = result.workOrders;
  const rootId = result.parent?.id ?? workOrders[0]?.id;
  const assigned = (workOrders.filter((w) => w.parent_id).length
    ? workOrders.filter((w) => w.parent_id)
    : workOrders
  ).map((w) => w.to_agent);

  if (isSecretaryMandate(opts?.fromAgent) && rootId) {
    return {
      handled: true,
      ok: workOrders.length > 0,
      work_order_ids: workOrders.map((w) => w.id),
      reply: formatSecretaryConsultCeoReply(rootId),
    };
  }

  return {
    handled: true,
    ok: workOrders.length > 0,
    work_order_ids: workOrders.map((w) => w.id),
    reply: formatStewardOrchestrateCeoReply({
      ok: workOrders.length > 0,
      rootId,
      agentIds: assigned,
    }),
  };
}
