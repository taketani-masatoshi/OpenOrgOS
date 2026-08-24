/**
 * Deterministic Steward Chat answers for contract portfolio KPIs (L1).
 * Mirrors finance-metrics-intent — does not invent Skill results.
 */
import {
  buildContractStatusView,
  formatContractStatusCeoReply,
  type ContractStatusView,
} from "../contract-status-view.js";

export interface ContractStatusChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  view?: ContractStatusView;
}

/**
 * Portfolio KPIs: counts, near-term expiry, exit / termination windows.
 * Keep orchestration phrases (「Contract に確認して」) out of this matcher.
 */
const CONTRACT_KPI_INTENT =
  /契約(?:本数|件数|台帳|期限|更新|解約|解除|ポートフォリオ|状況|一覧)|契約.{0,6}(?:何本|何件|何通|いくつ|総数|合計)|(?:何本|何件|何通|いくつ).{0,6}契約|解約できる|解除できる|解約期間|解除期間|Contract\s*(?:台帳|件数|本数|portfolio|status|期限)|CTR-\d{3,}|期限アラート|解約期限|退出窓|exit\s*window|直近の契約|直近.{0,8}(?:切れる|終了|満了).{0,8}契約|契約.{0,8}(?:切れる|満了|更新期限)/iu;

/** Broad domain mention — used by refusal guard (independent of KPI intent). */
const CONTRACT_DOMAIN =
  /契約|契約書|contract|リーガル|legal|NDA|覚書|業務委託|CTR-\d{3,}/iu;

/** Contract body / clause detail — not answered by portfolio KPI view. */
const CONTRACT_DETAIL =
  /条項|本文|詳細|解釈|レビュー|読んで|内容を確認|個別契約/iu;

const CONTRACT_REFUSAL =
  /Contract Agent|@contract_agent|data\/contracts\/\*\*|契約データを直接参照することは禁止|全契約データを直接|経営統括エージェントのポリシー上/iu;

/** Shared refusal essay signals (contract + generic Steward policy). */
const GENERIC_REFUSAL =
  /ポリシー上|直接参照|へ照会|Agent\s*へ|エージェントへ照会|コンテキストに(?:は)?含まれていません|参照することは禁止|管理する領域|現在のコンテキストには/iu;

export function isContractStatusChatIntent(message: string): boolean {
  return CONTRACT_KPI_INTENT.test(message.normalize("NFKC").trim());
}

export function isContractKpiTopic(message: string): boolean {
  return isContractStatusChatIntent(message);
}

export function mentionsContractDomain(message: string): boolean {
  return CONTRACT_DOMAIN.test(message.normalize("NFKC").trim());
}

/** True when the operator asks for contract body / clauses (needs Work Order). */
export function isContractDetailRequest(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!mentionsContractDomain(n)) return false;
  if (isContractStatusChatIntent(n)) return false;
  return CONTRACT_DETAIL.test(n);
}

export function looksLikeContractPolicyRefusal(reply: string): boolean {
  return CONTRACT_REFUSAL.test(reply.normalize("NFKC"));
}

export function looksLikeGenericRefusal(reply: string): boolean {
  const n = reply.normalize("NFKC");
  return CONTRACT_REFUSAL.test(n) || GENERIC_REFUSAL.test(n);
}

export function handleContractStatusChatMessage(message: string): ContractStatusChatResult {
  if (!isContractStatusChatIntent(message)) return { handled: false };

  const view = buildContractStatusView();
  return {
    handled: true,
    ok: true,
    reply: formatContractStatusCeoReply(view),
    view,
  };
}
