/**
 * Deterministic Steward Chat answers for outbound campaign KPIs (L1).
 */
import {
  buildSalesOutboundView,
  formatSalesOutboundCeoReply,
  type SalesOutboundView,
} from "../sales-outbound-view.js";
import { isSalesPipelineChatIntent } from "./sales-pipeline-intent.js";
import { isSalesInboundChatIntent } from "./sales-inbound-intent.js";

export interface SalesOutboundChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  view?: SalesOutboundView;
}

const OUTBOUND_KPI_INTENT =
  /アウトバウンド.{0,8}(?:状況|件数|何件|いくつ|接触率)|(?:ターゲット|送付|コールド)リスト.{0,8}(?:状況|接触率|精査)|リスト精査.{0,8}(?:状況|接触率)?|コールド(?:コール|メール|\s*outreach).{0,8}(?:状況|接触)?|新規開拓.{0,8}(?:状況|件数)|OUT-\d{4}-\d{3}|outbound.{0,12}(?:status|kpi|coverage)|接触率.{0,6}(?:状況|いくつ)/iu;

const OUTBOUND_DOMAIN =
  /アウトバウンド|(?:ターゲット|送付|コールド)リスト|リスト精査|コールド(?:コール|メール|\s*outreach)|新規開拓|OUT-\d{4}-\d{3}|outbound|接触率/iu;

const OUTBOUND_DETAIL =
  /条項|本文|詳細|個別|読んで|メール下書き|初回アプローチ|文案|LinkedIn/iu;

const OUTBOUND_REFUSAL =
  /Sales Outbound Agent|@sales_outbound|data\/sales\/outbound\/\*\*|リスト連絡先を直接参照することは禁止/iu;

export function isSalesOutboundChatIntent(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (isSalesPipelineChatIntent(n)) return false;
  if (isSalesInboundChatIntent(n)) return false;
  return OUTBOUND_KPI_INTENT.test(n);
}

export function isSalesOutboundKpiTopic(message: string): boolean {
  return isSalesOutboundChatIntent(message);
}

export function mentionsOutboundDomain(message: string): boolean {
  return OUTBOUND_DOMAIN.test(message.normalize("NFKC").trim());
}

export function isSalesOutboundDetailRequest(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!mentionsOutboundDomain(n)) return false;
  if (isSalesOutboundChatIntent(n)) return false;
  return OUTBOUND_DETAIL.test(n);
}

export function looksLikeSalesOutboundPolicyRefusal(reply: string): boolean {
  return OUTBOUND_REFUSAL.test(reply.normalize("NFKC"));
}

export function handleSalesOutboundChatMessage(
  message: string,
): SalesOutboundChatResult {
  if (!isSalesOutboundChatIntent(message)) return { handled: false };

  const view = buildSalesOutboundView({ includeDemo: false });
  return {
    handled: true,
    ok: true,
    reply: formatSalesOutboundCeoReply(view),
    view,
  };
}
