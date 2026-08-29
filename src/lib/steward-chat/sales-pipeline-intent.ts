/**
 * Deterministic Steward Chat answers for sales pipeline KPIs (L1).
 */
import {
  buildSalesPipelineView,
  formatSalesPipelineCeoReply,
  type SalesPipelineView,
} from "../sales-pipeline-view.js";

export interface SalesPipelineChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  view?: SalesPipelineView;
}

const SALES_KPI_INTENT =
  /商談|パイプライン|受注(?:予測|見込)|失注|見積|sales\s*(?:pipeline|forecast|status)|DEAL-\d{4}-\d{3}|営業.{0,6}(?:状況|件数|何件|いくつ)|(?:何件|何本|いくつ).{0,6}(?:商談|パイプライン)|加重パイプライン|pipeline\s*review/iu;

const SALES_DOMAIN =
  /商談|パイプライン|営業|sales|見積|受注|DEAL-\d{4}-\d{3}/iu;

const SALES_DETAIL =
  /条項|本文|詳細|個別商談|読んで|メール下書き|アウトバウンド文案/iu;

const SALES_REFUSAL =
  /Sales Lead Agent|@sales_lead|data\/sales\/\*\*|営業データを直接参照することは禁止/iu;

const GENERIC_REFUSAL =
  /ポリシー上|直接参照|へ照会|Agent\s*へ|エージェントへ照会|コンテキストに(?:は)?含まれていません|参照することは禁止|管理する領域|現在のコンテキストには/iu;

export function isSalesPipelineChatIntent(message: string): boolean {
  return SALES_KPI_INTENT.test(message.normalize("NFKC").trim());
}

export function isSalesKpiTopic(message: string): boolean {
  return isSalesPipelineChatIntent(message);
}

export function mentionsSalesDomain(message: string): boolean {
  return SALES_DOMAIN.test(message.normalize("NFKC").trim());
}

export function isSalesDetailRequest(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!mentionsSalesDomain(n)) return false;
  if (isSalesPipelineChatIntent(n)) return false;
  return SALES_DETAIL.test(n);
}

export function looksLikeSalesPolicyRefusal(reply: string): boolean {
  return SALES_REFUSAL.test(reply.normalize("NFKC"));
}

export function looksLikeGenericRefusal(reply: string): boolean {
  const n = reply.normalize("NFKC");
  return SALES_REFUSAL.test(n) || GENERIC_REFUSAL.test(n);
}

export function handleSalesPipelineChatMessage(
  message: string,
): SalesPipelineChatResult {
  if (!isSalesPipelineChatIntent(message)) return { handled: false };

  const view = buildSalesPipelineView({ includeDemo: false });
  return {
    handled: true,
    ok: true,
    reply: formatSalesPipelineCeoReply(view),
    view,
  };
}
