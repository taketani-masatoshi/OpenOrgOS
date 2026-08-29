/**
 * Deterministic Steward Chat answers for customer success KPIs (L1).
 */
import {
  buildCustomerSuccessView,
  formatCustomerSuccessCeoReply,
  formatCustomerSuccessMarkdown,
  type CustomerSuccessView,
} from "../customer-success-view.js";

export interface CustomerSuccessChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  view?: CustomerSuccessView;
}

const CS_KPI_INTENT =
  /顧客|カスタマーサクセス|CS|解約|チャーン|churn|更新期日|renewal|ヘルス|health\s*score|NPS|QBR|オンボーディング|CUST-\d{4}-\d{3}|customer\s*success|at_risk|drift/iu;

const CS_DOMAIN =
  /顧客|カスタマーサクセス|CS|解約|更新|NPS|QBR|オンボーディング|customer|CUST-\d{4}-\d{3}/iu;

const CS_DETAIL =
  /条項|本文|詳細|個別顧客|読んで|メール下書き|連絡先|電話|メールアドレス/iu;

const CS_REFUSAL =
  /Customer Success Agent|@customer_success|data\/customers\/\*\*|顧客データを直接参照することは禁止/iu;

const GENERIC_REFUSAL =
  /ポリシー上|直接参照|へ照会|Agent\s*へ|エージェントへ照会|コンテキストに(?:は)?含まれていません|参照することは禁止|管理する領域|現在のコンテキストには/iu;

export function isCustomerSuccessChatIntent(message: string): boolean {
  return CS_KPI_INTENT.test(message.normalize("NFKC").trim());
}

export function mentionsCustomerSuccessDomain(message: string): boolean {
  return CS_DOMAIN.test(message.normalize("NFKC").trim());
}

export function isCustomerSuccessDetailRequest(message: string): boolean {
  const n = message.normalize("NFKC").trim();
  if (!mentionsCustomerSuccessDomain(n)) return false;
  if (CS_DETAIL.test(n)) return true;
  if (isCustomerSuccessChatIntent(n)) return false;
  return false;
}

export function looksLikeCustomerSuccessPolicyRefusal(reply: string): boolean {
  return CS_REFUSAL.test(reply.normalize("NFKC"));
}

export function looksLikeGenericRefusal(reply: string): boolean {
  const n = reply.normalize("NFKC");
  return CS_REFUSAL.test(n) || GENERIC_REFUSAL.test(n);
}

export function handleCustomerSuccessChatMessage(
  message: string,
): CustomerSuccessChatResult {
  if (!isCustomerSuccessChatIntent(message)) return { handled: false };

  const view = buildCustomerSuccessView({ includeDemo: false });
  return {
    handled: true,
    ok: true,
    reply: formatCustomerSuccessCeoReply(view),
    view,
  };
}
