/**
 * Deterministic Steward Chat answers for inbound inquiry KPIs (L1).
 */
import {
  buildSalesInboundView,
  formatSalesInboundCeoReply,
  type SalesInboundView,
} from "../sales-inbound-view.js";
import { isSalesPipelineChatIntent } from "./sales-pipeline-intent.js";

export interface SalesInboundChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  view?: SalesInboundView;
}

const INBOUND_KPI_INTENT =
  /問合せ.{0,8}(?:状況|件数|何件|いくつ|未対応)|問い合わせ.{0,8}(?:状況|件数|何件|いくつ|未対応)|未対応.{0,6}問合|引合|反響|資料請求|INQ-\d{4}-\d{3}|inbound.{0,12}(?:status|kpi|queue)|inquiry.{0,12}(?:status|kpi|queue)|インバウンド.{0,6}(?:状況|件数|KPI)/iu;

const INBOUND_DOMAIN =
  /問合せ|問い合わせ|引合|反響|資料請求|提携|パートナー|INQ-\d{4}-\d{3}|inbound|inquiry|インバウンド/iu;

const INBOUND_DETAIL =
  /条項|本文|詳細|個別|読んで|メール下書き|初回回答|返信文案/iu;

const INBOUND_REFUSAL =
  /Sales Inbound Agent|@sales_inbound|data\/sales\/inbound\/\*\*|問合せデータを直接参照することは禁止/iu;

export function isSalesInboundChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (isSalesPipelineChatIntent(n)) return false;
  return INBOUND_KPI_INTENT.test(n);
}

export function isSalesInboundKpiTopic(message: string): boolean {
  return isSalesInboundChatIntent(message);
}

export function mentionsInboundDomain(message: string): boolean {
  return INBOUND_DOMAIN.test(message.normalize("NFKC").trim());
}

export function isSalesInboundDetailRequest(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!mentionsInboundDomain(n)) return false;
  if (isSalesInboundChatIntent(n)) return false;
  return INBOUND_DETAIL.test(n);
}

export function looksLikeSalesInboundPolicyRefusal(reply: string): boolean {
  return INBOUND_REFUSAL.test(reply.normalize("NFKC"));
}

export function handleSalesInboundChatMessage(
  message: string,
): SalesInboundChatResult {
  if (!isSalesInboundChatIntent(message)) return { handled: false };

  const view = buildSalesInboundView({ includeDemo: false });
  return {
    handled: true,
    ok: true,
    reply: formatSalesInboundCeoReply(view),
    view,
  };
}
