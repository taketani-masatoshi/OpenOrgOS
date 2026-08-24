import { runEscalation } from "../escalate.js";
import { getTenantId } from "../tenant.js";
import { loadCompany } from "../data.js";

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
  /(?:(?:Finance|ファイナンス|財務|Contract|契約|Compliance|コンプライアンス|コンプラ|Operations|オペレーション|秘書|Secretary|Legal|リーガル|人事|HR|Human\s*Resources|労務)(?:\s*(?:エージェント|Agent|agent))?|(?:他の?エージェント|部門エージェント)).{0,24}(?:に|へ).{0,20}(?:確認|照会|依頼|聞いて|聞い|調査|委譲)|(?:契約書|契約).{0,16}(?:条項|本文|詳細).{0,12}(?:確認|レビュー|読んで|調査)|(?:Work\s*Order|ワーク\s*オーダー|IMP).{0,8}(?:を)?(?:作|起票|作成)|(?:委譲して|オーケストレ(?:ート)?して?)/iu;

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
  if (/契約|Contract|CTR-|解約|期限アラート|リーガル|Legal/i.test(n)) {
    return { path: "data/contracts/", routeBoost: "契約台帳・期限・退出窓の確認" };
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

  if (result.workOrders.length === 0) {
    return {
      handled: true,
      ok: false,
      reply: [
        `# オーケストレーション — ${company.name}`,
        "",
        "Work Order を起票できませんでした（マッチする担当エージェントなし）。",
        "`orgos escalate plan` でルートを確認するか、要件に Path（例: `data/contracts/` · `data/finance/`）を含めてください。",
        "",
        "数値や報告書は捏造しません。",
      ].join("\n"),
    };
  }

  const children = result.workOrders.filter((w) => w.parent_id);
  const rows = (children.length ? children : result.workOrders).map(
    (w) => `- **${w.id}** → ${w.to_agent}（${w.status}）`
  );

  return {
    handled: true,
    ok: true,
    work_order_ids: result.workOrders.map((w) => w.id),
    reply: [
      `# オーケストレーション — ${company.name}`,
      "",
      "Steward が **実在の Work Order** を起票しました（LLM の「委譲したふり」ではありません）。",
      "",
      `**親:** ${result.parent?.id ?? result.workOrders[0]?.id}`,
      "**担当:**",
      ...rows,
      "",
      "完了後は「委譲と回答」受信箱に要約が届きます。",
      `確認: \`orgos escalate status --pending\` · Path: \`docs/reports/routing-queue/\``,
      "",
      "経営向けの単純 KPI（契約本数・90日期限・解除窓 / バーン・ランウェイ / 従業員数）は起票せず即答できます。",
      "例:「契約本数を教えて」「従業員数は何人？」「Contract / 人事 に詳細を確認して」",
    ].join("\n"),
  };
}
