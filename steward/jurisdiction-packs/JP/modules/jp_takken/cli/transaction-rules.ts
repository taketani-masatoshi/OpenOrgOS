import type {
  TakkenFeePayer,
  TakkenOffice,
  TakkenshiAssignment,
  TakkenTaxStatus,
  TakkenTransaction,
} from "../../../../../../schemas/jp-takken.js";
import {
  type TakkenCheckItem,
  type TakkenCheckStatus,
  type TakkenVerdict,
  worstStatus,
} from "./check-item.js";
import { daysBetween } from "./dates.js";
import { computeFeeLimit, exchangeBasisYen, type FeeLimit } from "./fee.js";
import { isCardValidOn } from "./staffing-rules.js";

export interface TransactionContext {
  offices: readonly TakkenOffice[];
  taxStatus: TakkenTaxStatus;
  knownDealIds: ReadonlySet<string> | null;
  asOf: string;
}

export interface TransactionCheckResult {
  transaction_id: string;
  deal_id: string | null;
  status: TakkenCheckStatus;
  checks: TakkenCheckItem[];
}

export function findTakkenshi(
  offices: readonly TakkenOffice[],
  employeeId: string
): TakkenshiAssignment | undefined {
  return offices.flatMap((office) => office.takkenshi).find((t) => t.employee_id === employeeId);
}

function explanationTimingVerdict(tx: TakkenTransaction): TakkenVerdict {
  const explainedOn = tx.explained_35_on;
  if (!tx.contract_on) {
    return explainedOn
      ? { status: "ok", detail: `説明 ${explainedOn}（契約未成立）` }
      : { status: "warn", detail: "契約未成立 — 契約成立までに宅建士が書面を交付して説明" };
  }
  if (!explainedOn) return { status: "fail", detail: `契約成立 ${tx.contract_on} · 重要事項説明の記録なし` };
  if (explainedOn < tx.contract_on) return { status: "ok", detail: `説明 ${explainedOn} < 契約 ${tx.contract_on}` };
  if (explainedOn === tx.contract_on) {
    return { status: "needs_review", detail: `契約日と同日 (${explainedOn}) — 契約成立前の説明か記録で確認` };
  }
  return { status: "fail", detail: `契約成立 ${tx.contract_on} 後の説明 (${explainedOn})` };
}

export function evaluateExplanationTiming(tx: TakkenTransaction): TakkenCheckItem {
  const dealerCounterparty = tx.counterparty_is_licensed_dealer;
  return {
    id: "35-before-contract",
    label: dealerCounterparty
      ? "重要事項書面の交付（相手方が宅建業者 · 説明省略可）"
      : "重要事項説明（契約成立前 · 宅建士 · 書面交付）",
    article: dealerCounterparty ? "法第35条第1項・第6項" : "法第35条第1項",
    ...explanationTimingVerdict(tx),
  };
}

function takkenshiOnDateVerdict(
  offices: readonly TakkenOffice[],
  employeeId: string | undefined,
  onDate: string
): TakkenVerdict {
  if (!employeeId) return { status: "needs_review", detail: "担当宅建士の employee_id 未記録" };
  const assignment = findTakkenshi(offices, employeeId);
  if (!assignment) return { status: "needs_review", detail: `${employeeId} は offices.yaml の宅建士名簿にない` };
  if (!isCardValidOn(assignment, onDate)) {
    return { status: "fail", detail: `${employeeId} の宅建士証は ${assignment.card_expires_on} で失効（実施日 ${onDate}）` };
  }
  return { status: "ok", detail: `${employeeId} · 宅建士証有効（〜${assignment.card_expires_on}）` };
}

function evaluateExplainer(tx: TakkenTransaction, offices: readonly TakkenOffice[]): TakkenCheckItem[] {
  if (!tx.explained_35_on) return [];
  return [
    {
      id: "35-by-takkenshi",
      label: "重要事項説明・記名は宅建士（宅建士証提示）",
      article: "法第35条第1項・第4項・第5項",
      ...takkenshiOnDateVerdict(offices, tx.explained_35_by, tx.explained_35_on),
    },
  ];
}

function deliveryVerdict(tx: TakkenTransaction, asOf: string): TakkenVerdict {
  if (!tx.contract_on) return { status: "ok", detail: "契約未成立 — 対象外" };
  const deliveredOn = tx.delivered_37_on;
  if (!deliveredOn) {
    const elapsed = daysBetween(tx.contract_on, asOf);
    return elapsed <= 0
      ? { status: "warn", detail: `契約成立 ${tx.contract_on} — 遅滞なく交付` }
      : { status: "fail", detail: `未交付（契約成立 ${tx.contract_on} から ${elapsed} 日）` };
  }
  if (deliveredOn < tx.contract_on) {
    return { status: "needs_review", detail: `契約成立 ${tx.contract_on} より前の交付日 ${deliveredOn} — 記録を確認` };
  }
  const lag = daysBetween(tx.contract_on, deliveredOn);
  if (lag === 0) return { status: "ok", detail: `契約成立日に交付 (${deliveredOn})` };
  return {
    status: "needs_review",
    detail: `契約成立から ${lag} 日後に交付 (${deliveredOn}) — 「遅滞なく」に日数基準なし · 事情を確認`,
  };
}

export function evaluateContractDelivery(tx: TakkenTransaction, asOf: string): TakkenCheckItem {
  return {
    id: "37-delivery",
    label: "契約成立後の書面（37条書面）の交付",
    article: tx.kind === "lease" ? "法第37条第2項" : "法第37条第1項",
    ...deliveryVerdict(tx, asOf),
  };
}

function evaluateContractSigner(tx: TakkenTransaction, offices: readonly TakkenOffice[]): TakkenCheckItem[] {
  if (!tx.delivered_37_on) return [];
  return [
    {
      id: "37-signed-by-takkenshi",
      label: "37条書面への宅建士の記名",
      article: "法第37条第3項",
      ...takkenshiOnDateVerdict(offices, tx.signed_37_by, tx.delivered_37_on),
    },
  ];
}

export function resolveFeeBasisYen(tx: TakkenTransaction): number | null {
  if (tx.kind === "lease") return tx.monthly_rent_yen ?? null;
  if (tx.price_yen === undefined) return null;
  return tx.kind === "exchange" ? exchangeBasisYen(tx.price_yen, tx.exchange_counter_value_yen) : tx.price_yen;
}

function payerAmounts(tx: TakkenTransaction): Record<TakkenFeePayer, number> {
  return { client: tx.fee_charged_yen ?? 0, other_party: tx.fee_from_other_party_yen ?? 0 };
}

const PAYER_LABELS: Record<TakkenFeePayer, string> = { client: "依頼者", other_party: "他方当事者" };

function yen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")} 円`;
}

export function feeLimitViolations(limit: FeeLimit, tx: TakkenTransaction): string[] {
  const amounts = payerAmounts(tx);
  const violations: string[] = [];
  const combined = amounts.client + amounts.other_party;
  if (limit.combined_cap_yen !== null && combined > limit.combined_cap_yen) {
    violations.push(`合計 ${yen(combined)} > 上限 ${yen(limit.combined_cap_yen)}`);
  }
  for (const payer of Object.keys(amounts) as TakkenFeePayer[]) {
    const payerCap = payerCapYen(limit, tx, payer);
    if (amounts[payer] > payerCap) {
      violations.push(`${PAYER_LABELS[payer]} ${yen(amounts[payer])} > 上限 ${yen(payerCap)}`);
    }
  }
  return violations;
}

function payerCapYen(limit: FeeLimit, tx: TakkenTransaction, payer: TakkenFeePayer): number {
  const consented = tx.one_month_consent_from.includes(payer);
  if (limit.residential_one_party_cap_yen !== null && !consented) return limit.residential_one_party_cap_yen;
  return limit.per_client_cap_yen;
}

function hasUnencodedFeeSpecial(tx: TakkenTransaction): boolean {
  const keyMoneyLease = tx.kind === "lease" && !tx.residential && tx.key_money_yen !== undefined;
  return tx.long_term_vacant || keyMoneyLease;
}

function specialAgreementVerdict(tx: TakkenTransaction, limit: FeeLimit): TakkenVerdict {
  const within = `低廉な空家等の特例（${limit.basis_articles.join("・")}）の上限 ${yen(limit.per_client_cap_yen)} 以内`;
  if (!tx.special_fee_agreed_on) {
    return { status: "needs_review", detail: `${within} — 事前の説明・合意（special_fee_agreed_on）未記録` };
  }
  if (tx.mediation_contract_on && tx.special_fee_agreed_on > tx.mediation_contract_on) {
    return { status: "needs_review", detail: `${within} — 合意 ${tx.special_fee_agreed_on} が契約締結 ${tx.mediation_contract_on} より後` };
  }
  return { status: "ok", detail: `${within} · 合意 ${tx.special_fee_agreed_on}` };
}

function feeVerdict(tx: TakkenTransaction, taxStatus: TakkenTaxStatus): TakkenVerdict {
  if (tx.fee_charged_yen === undefined && tx.fee_from_other_party_yen === undefined) {
    return { status: "warn", detail: "報酬未記録 — 受領時に再確認" };
  }
  const basisYen = resolveFeeBasisYen(tx);
  if (basisYen === null) return { status: "needs_review", detail: "price_yen / monthly_rent_yen 未記録" };
  const query = { kind: tx.kind, role: tx.role, basisYen, taxStatus, residential: tx.residential };
  const standard = computeFeeLimit({ ...query, lowCostVacantSpecial: false });
  const standardViolations = feeLimitViolations(standard, tx);
  if (standardViolations.length === 0) {
    return { status: "ok", detail: `上限内（${standard.basis_articles.join("・")} · 依頼者上限 ${yen(standard.per_client_cap_yen)}）` };
  }
  if (hasUnencodedFeeSpecial(tx)) {
    return { status: "needs_review", detail: `${standardViolations.join(" · ")} — 長期の空家等・権利金の特例は未実装 · 人間確認` };
  }
  const special = tx.low_cost_vacant_house ? computeFeeLimit({ ...query, lowCostVacantSpecial: true }) : null;
  if (special?.special_applied && feeLimitViolations(special, tx).length === 0) {
    return specialAgreementVerdict(tx, special);
  }
  return { status: "fail", detail: standardViolations.join(" · ") };
}

export function evaluateTransactionFee(tx: TakkenTransaction, taxStatus: TakkenTaxStatus): TakkenCheckItem {
  return {
    id: "fee-within-limit",
    label: "報酬額が告示の上限以内",
    article: "法第46条第2項 · 報酬告示",
    ...feeVerdict(tx, taxStatus),
  };
}

function dealLinkVerdict(tx: TakkenTransaction, knownDealIds: ReadonlySet<string> | null): TakkenVerdict {
  if (!tx.deal_id) return { status: "ok", detail: "deal_id 未設定（媒介台帳と非連携）" };
  if (!knownDealIds) return { status: "ok", detail: `${tx.deal_id} · real_estate_brokerage deals.yaml なし — 照合省略` };
  return knownDealIds.has(tx.deal_id)
    ? { status: "ok", detail: `${tx.deal_id} · deals.yaml と一致` }
    : { status: "needs_review", detail: `${tx.deal_id} が real_estate_brokerage deals.yaml にない` };
}

export function evaluateDealLink(tx: TakkenTransaction, knownDealIds: ReadonlySet<string> | null): TakkenCheckItem {
  return {
    id: "deal-link",
    label: "媒介台帳（real_estate_brokerage）との照合",
    article: "—",
    ...dealLinkVerdict(tx, knownDealIds),
  };
}

export function evaluateTransaction(tx: TakkenTransaction, ctx: TransactionContext): TransactionCheckResult {
  const checks = [
    evaluateExplanationTiming(tx),
    ...evaluateExplainer(tx, ctx.offices),
    evaluateContractDelivery(tx, ctx.asOf),
    ...evaluateContractSigner(tx, ctx.offices),
    evaluateTransactionFee(tx, ctx.taxStatus),
    evaluateDealLink(tx, ctx.knownDealIds),
  ];
  return {
    transaction_id: tx.id,
    deal_id: tx.deal_id ?? null,
    status: worstStatus(checks.map((check) => check.status)),
    checks,
  };
}
