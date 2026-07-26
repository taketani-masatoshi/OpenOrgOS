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
 * Matches "Finance に確認して" / "委譲して" etc. Does not invent Skill results.
 */
const ORCHESTRATE_INTENT =
  /(?:Finance|ファイナンス|財務(?:エージェント|Agent)?).{0,16}(?:に|へ|へ).{0,12}(?:確認|照会|依頼|聞いて|聞い|調査)|(?:他の?エージェント|部門エージェント).{0,12}(?:に|へ).{0,8}(?:依頼|確認|委譲)|(?:Work\s*Order|ワーク\s*オーダー|IMP).{0,8}(?:を)?(?:作|起票|作成)|(?:委譲して|オーケストレ)/iu;

export function isStewardOrchestrateIntent(message: string): boolean {
  return ORCHESTRATE_INTENT.test(message.normalize("NFKC").trim());
}

function inferRouteHints(message: string): { path?: string; routeBoost: string } {
  const n = message.normalize("NFKC");
  if (/財務|Finance|バーン|キャッシュ|予実|資金|ランウェイ/i.test(n)) {
    // Prefer finance monthly-close / variance routes (eligible on core finance agent).
    return {
      path: "data/finance/monthly/",
      routeBoost: "月次収支・予実差異の確認",
    };
  }
  if (/契約|Contract/i.test(n)) {
    return { path: "data/contracts/", routeBoost: "契約期限の確認" };
  }
  if (/コンプラ|許認可|Compliance/i.test(n)) {
    return { path: "data/classification-registry.yaml", routeBoost: "コンプライアンス確認" };
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
  opts?: { fromAgent?: string }
): StewardOrchestrateResult {
  if (!isStewardOrchestrateIntent(message)) return { handled: false };

  const company = loadCompany();
  const subject = message.replace(/\s+/g, " ").trim().slice(0, 120);
  const hints = inferRouteHints(message);
  const requirements = [message.trim(), hints.routeBoost ? `（${hints.routeBoost}）` : ""]
    .filter(Boolean)
    .join("\n");
  const result = runEscalation({
    fromAgent: opts?.fromAgent ?? "executive_steward",
    tenant: getTenantId(),
    input: {
      subject: subject || `${company.name} への確認依頼`,
      background: `Steward Chat からの自動オーケストレーション（${company.name}）`,
      requirements,
      path: hints.path,
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
        "`orgos escalate plan` でルートを確認するか、要件に Path（例: data/finance/）を含めてください。",
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
      "財務の単純なバーンレート／ランウェイは、起票せず月次 YAML から即答できます（例:「2026年5月のバーンレート」）。",
    ].join("\n"),
  };
}
