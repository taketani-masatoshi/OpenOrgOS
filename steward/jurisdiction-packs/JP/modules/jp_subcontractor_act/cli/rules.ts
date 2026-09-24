import type {
  SubcontractCategory,
  SubcontractEventKind,
  SubcontractTransaction,
} from "../../../../../../schemas/jp-subcontractor-act.js";

/** 令和7年法律第41号附則第1条 — 取適法の施行日 */
export const TORITEKI_EFFECTIVE_DATE = "2026-01-01";
/** 法第3条第1項 — 受領日から起算して60日（受領日を算入）以内に支払期日を定める */
export const PAYMENT_TERM_DAYS = 60;
/** 法第6条第1項・第2項の率を定める規則（令和7年公正取引委員会規則第9号）— 年14.6%（千分率） */
export const LATE_INTEREST_RATE_PER_MILLE = 146;
const PER_MILLE = 1000;
/** 年率の日割り分母 — 閏年も365日固定（本モジュールの計算方針） */
export const LATE_INTEREST_DAYS_PER_YEAR = 365;
/** 法第7条の書類等の作成及び保存に関する規則（令和7年公正取引委員会規則第10号）第3条 — 2年間 */
export const RECORD_RETENTION_YEARS = 2;
const MS_PER_DAY = 86_400_000;

export type CheckStatus = "pass" | "fail" | "needs_review" | "not_applicable" | "not_assessed";
export type TransactionOutcome = "fail" | "needs_review" | "no_issue_detected";

export interface SubcontractCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  article: string;
  detail: string;
}

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtcMs(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / MS_PER_DAY);
}

/** 民法第143条第2項 — 応当日がない場合はその月の末日 */
export function addYears(iso: string, years: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return new Date(Date.UTC(year + years, month - 1, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

export function isLegacyOrder(orderedOn: string): boolean {
  return orderedOn < TORITEKI_EFFECTIVE_DATE;
}

/** 法第5条第1項柱書・第2項柱書 — 役務提供委託・特定運送委託は受領拒否・返品・有償支給早期決済の対象外 */
export function isServiceLikeCategory(category: SubcontractCategory): boolean {
  return category.startsWith("service_") || category === "specific_transport";
}

export function latestLawfulDueDate(receivedOn: string): string {
  return addDays(receivedOn, PAYMENT_TERM_DAYS - 1);
}

/** 法第6条第1項 — 受領日から起算して60日を経過した日 */
export function lateInterestStartDate(receivedOn: string): string {
  return addDays(receivedOn, PAYMENT_TERM_DAYS);
}

/** 法第3条第2項 — 未設定なら受領日、60日超なら60日を経過した日の前日をみなし支払期日とする */
export function deemedPaymentDueDate(receivedOn: string, agreedDueOn?: string): string {
  if (!agreedDueOn) return receivedOn;
  const latest = latestLawfulDueDate(receivedOn);
  return agreedDueOn > latest ? latest : agreedDueOn;
}

export interface InterestPeriod {
  start_on: string;
  end_on: string;
  days: number;
  principal_yen: number;
  interest_yen: number;
}

/** 開始日・支払日の両端を算入し、円未満は切捨て（本モジュールの計算方針） */
export function computeInterest(
  principalYen: number,
  startOn: string,
  endOn: string
): InterestPeriod {
  const days = Math.max(0, daysBetween(startOn, endOn) + 1);
  const interestYen = Math.floor(
    (principalYen * LATE_INTEREST_RATE_PER_MILLE * days) / (PER_MILLE * LATE_INTEREST_DAYS_PER_YEAR)
  );
  return {
    start_on: startOn,
    end_on: endOn,
    days,
    principal_yen: principalYen,
    interest_yen: interestYen,
  };
}

/** 法第6条第1項 — 支払遅延の遅延利息 */
export function computeLatePaymentInterest(input: {
  receivedOn: string;
  agreedDueOn?: string;
  settledOn: string;
  unpaidYen: number;
}): InterestPeriod {
  const dueOn = deemedPaymentDueDate(input.receivedOn, input.agreedDueOn);
  const start = lateInterestStartDate(input.receivedOn);
  if (input.settledOn <= dueOn) return computeInterest(input.unpaidYen, start, dueOn);
  return computeInterest(input.unpaidYen, start, input.settledOn);
}

/** 法第6条第2項 — 減額の遅延利息（減額日と60日経過日のいずれか遅い日から） */
export function computeReductionInterest(input: {
  receivedOn: string;
  reducedOn: string;
  reducedYen: number;
  refundedOn: string;
}): InterestPeriod {
  const start = laterOf(input.reducedOn, lateInterestStartDate(input.receivedOn));
  return computeInterest(input.reducedYen, start, input.refundedOn);
}

export interface SettlementDate {
  settled_on: string;
  provisional: boolean;
  review_notes: string[];
}

/** Q&A Q83 — 手形交付時は満期日を「支払をする日」として扱う */
export function resolveSettlementDate(tx: SubcontractTransaction, asOf: string): SettlementDate {
  const notes: string[] = [];
  const base = tx.paid_on ?? asOf;
  const provisional = !tx.paid_on;
  if (provisional) notes.push(`未払 — ${asOf} 時点の暫定計算`);
  if (tx.payment_method === "bank_transfer" || tx.payment_method === "cash") {
    return { settled_on: base, provisional, review_notes: notes };
  }
  if (!tx.instrument_maturity_on) {
    notes.push("手形等の満期日・決済日が未記録 — 支払日を確定できない");
    return { settled_on: base, provisional: true, review_notes: notes };
  }
  if (tx.payment_method !== "promissory_note" && tx.instrument_maturity_on > base) {
    notes.push("電子記録債権・一括決済の満期日基準は手形の扱いを準用（要確認）");
  }
  return { settled_on: laterOf(base, tx.instrument_maturity_on), provisional, review_notes: notes };
}

export function netAmountYen(tx: SubcontractTransaction): number {
  return tx.amount_changes.reduce((sum, change) => sum + change.delta_yen, tx.amount_yen);
}

export function unjustifiedReductions(
  tx: SubcontractTransaction
): SubcontractTransaction["amount_changes"] {
  return tx.amount_changes.filter(
    (change) => change.delta_yen < 0 && change.cause !== "supplier_fault"
  );
}

function item(
  id: string,
  label: string,
  article: string,
  status: CheckStatus,
  detail: string
): SubcontractCheckItem {
  return { id, label, article, status, detail };
}

export function checkDisclosure(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "発注内容等の明示（書面又は電磁的方法）";
  const article = "法第4条第1項";
  if (!tx.terms_disclosed_on) return item("disclosure", label, article, "fail", "明示日が未記録");
  if (!tx.disclosure_method)
    return item("disclosure", label, article, "needs_review", "明示方法が未記録");
  if (tx.terms_disclosed_on <= tx.ordered_on) {
    return item(
      "disclosure",
      label,
      article,
      "pass",
      `${tx.terms_disclosed_on} · ${tx.disclosure_method}`
    );
  }
  const lag = daysBetween(tx.ordered_on, tx.terms_disclosed_on);
  return item(
    "disclosure",
    label,
    article,
    "needs_review",
    `発注から${lag}日後に明示 —「直ちに」該当性・未定事項の正当理由を確認`
  );
}

export function checkPaperCopy(tx: SubcontractTransaction): SubcontractCheckItem | null {
  if (tx.disclosure_method !== "electronic" || !tx.paper_copy_requested_on) return null;
  const label = "電磁的明示後の書面交付請求への対応";
  const article = "法第4条第2項";
  if (tx.paper_copy_delivered_on) {
    return item("paper-copy", label, article, "pass", `交付 ${tx.paper_copy_delivered_on}`);
  }
  return item(
    "paper-copy",
    label,
    article,
    "needs_review",
    `請求 ${tx.paper_copy_requested_on} · 未交付 — 遅滞なく交付又は規則上の例外を確認`
  );
}

export function checkPaymentTerm(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "支払期日を受領日から60日以内に設定";
  const article = "法第3条第1項・第2項";
  if (!tx.received_on) return item("payment-term", label, article, "not_applicable", "未受領");
  const latest = latestLawfulDueDate(tx.received_on);
  if (!tx.payment_due_on) {
    return item(
      "payment-term",
      label,
      article,
      "fail",
      `支払期日未設定 — 受領日 ${tx.received_on} が支払期日とみなされる`
    );
  }
  if (tx.payment_due_on > latest) {
    return item(
      "payment-term",
      label,
      article,
      "fail",
      `支払期日 ${tx.payment_due_on} が上限 ${latest} を超過 — ${latest} とみなされる`
    );
  }
  return item(
    "payment-term",
    label,
    article,
    "pass",
    `支払期日 ${tx.payment_due_on}（上限 ${latest}）`
  );
}

export function checkPaymentMethod(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "支払手段（手形払等の禁止）";
  const article = "法第5条第1項第2号";
  const method = tx.payment_method;
  if (method === "bank_transfer" || method === "cash")
    return item("payment-method", label, article, "pass", method);
  if (method === "promissory_note")
    return item("payment-method", label, article, "fail", "手形の交付は支払遅延に該当");
  if (tx.supplier_bears_instrument_fees) {
    return item("payment-method", label, article, "fail", `${method} の手数料等を受託側が負担`);
  }
  const dueOn = tx.received_on
    ? deemedPaymentDueDate(tx.received_on, tx.payment_due_on)
    : tx.payment_due_on;
  if (!tx.instrument_maturity_on || !dueOn) {
    return item(
      "payment-method",
      label,
      article,
      "needs_review",
      `${method} — 満期日・決済日又は支払期日が未記録`
    );
  }
  if (tx.instrument_maturity_on > dueOn) {
    return item(
      "payment-method",
      label,
      article,
      "fail",
      `${method} の満期日 ${tx.instrument_maturity_on} が支払期日 ${dueOn} より後`
    );
  }
  return item(
    "payment-method",
    label,
    article,
    "pass",
    `${method} · 満期日 ${tx.instrument_maturity_on} ≤ 支払期日 ${dueOn}`
  );
}

export function checkLatePayment(tx: SubcontractTransaction, asOf: string): SubcontractCheckItem {
  const label = "支払期日までの支払（支払遅延）";
  const article = "法第5条第1項第2号・第6条第1項";
  if (!tx.received_on) return item("late-payment", label, article, "not_applicable", "未受領");
  const dueOn = deemedPaymentDueDate(tx.received_on, tx.payment_due_on);
  const settlement = resolveSettlementDate(tx, asOf);
  if (settlement.settled_on > dueOn && !(settlement.provisional && asOf <= dueOn)) {
    const lateDays = daysBetween(dueOn, settlement.settled_on);
    return item(
      "late-payment",
      label,
      article,
      "fail",
      `支払期日 ${dueOn} から${lateDays}日遅延（基準日 ${settlement.settled_on}）`
    );
  }
  if (!tx.paid_on)
    return item(
      "late-payment",
      label,
      article,
      "pass",
      `未払 · 支払期日 ${dueOn} 前（${asOf} 時点）`
    );
  if (settlement.review_notes.length) {
    return item(
      "late-payment",
      label,
      article,
      "needs_review",
      settlement.review_notes.join(" / ")
    );
  }
  return item(
    "late-payment",
    label,
    article,
    "pass",
    `支払 ${settlement.settled_on} ≤ 支払期日 ${dueOn}`
  );
}

export function checkAmountReduction(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "代金の減額";
  const article = "法第5条第1項第3号・第6条第2項";
  const reductions = tx.amount_changes.filter((change) => change.delta_yen < 0);
  if (!reductions.length) return item("amount-reduction", label, article, "pass", "減額なし");
  const unjustified = unjustifiedReductions(tx);
  if (unjustified.length) {
    const total = unjustified.reduce((sum, change) => sum + Math.abs(change.delta_yen), 0);
    const reasons = unjustified.map((change) => change.reason).join(" / ");
    return item(
      "amount-reduction",
      label,
      article,
      "fail",
      `受託側の責めによらない減額 ${total.toLocaleString("ja-JP")} 円（${reasons}）`
    );
  }
  return item(
    "amount-reduction",
    label,
    article,
    "needs_review",
    "受託側の責めに帰すべき理由による減額 — 根拠・範囲を確認"
  );
}

export function checkReturns(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "受領後の返品";
  const article = "法第5条第1項第4号";
  if (isServiceLikeCategory(tx.category))
    return item("returns", label, article, "not_applicable", "役務提供委託・特定運送委託");
  if (!tx.returns.length) return item("returns", label, article, "pass", "返品なし");
  if (tx.returns.some((ret) => !ret.supplier_fault)) {
    return item("returns", label, article, "fail", "受託側の責めによらない返品あり");
  }
  return item(
    "returns",
    label,
    article,
    "needs_review",
    "受託側の責めによる返品 — 検査方法・返品期間を確認"
  );
}

export function checkPaidMaterials(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "有償支給原材料等の対価の早期決済";
  const article = "法第5条第2項第1号";
  if (isServiceLikeCategory(tx.category))
    return item("paid-materials", label, article, "not_applicable", "役務提供委託・特定運送委託");
  if (!tx.paid_materials.length)
    return item("paid-materials", label, article, "pass", "有償支給なし");
  const dueOn = tx.received_on
    ? deemedPaymentDueDate(tx.received_on, tx.payment_due_on)
    : tx.payment_due_on;
  if (!dueOn)
    return item(
      "paid-materials",
      label,
      article,
      "needs_review",
      "支払期日未確定 — 決済時期を比較できない"
    );
  const early = tx.paid_materials.filter((material) => material.settled_on < dueOn);
  if (!early.length)
    return item("paid-materials", label, article, "pass", `決済は支払期日 ${dueOn} 以降`);
  return item(
    "paid-materials",
    label,
    article,
    "needs_review",
    `支払期日 ${dueOn} より前の決済 ${early.length} 件 — 受託側の責めの有無を確認`
  );
}

const EVENT_RULES: Record<SubcontractEventKind, { label: string; article: string }> = {
  receipt_refusal: { label: "受領拒否", article: "法第5条第1項第1号" },
  below_market_price: { label: "買いたたき", article: "法第5条第1項第5号" },
  forced_purchase: { label: "購入・利用強制", article: "法第5条第1項第6号" },
  retaliation: { label: "報復措置", article: "法第5条第1項第7号" },
  benefit_request: { label: "不当な経済上の利益の提供要請", article: "法第5条第2項第2号" },
  spec_change_or_redo: { label: "不当な給付内容の変更・やり直し", article: "法第5条第2項第3号" },
  price_negotiation_requested: {
    label: "価格協議の求め（協議・説明の実施を確認）",
    article: "法第5条第2項第4号",
  },
  price_negotiation_declined: {
    label: "協議に応じない一方的な代金決定",
    article: "法第5条第2項第4号",
  },
};

/** 事実認定が必要な禁止行為 — 記録イベントがあれば needs_review、なければ not_assessed（自動 pass しない） */
export function checkJudgementEvents(tx: SubcontractTransaction): SubcontractCheckItem[] {
  if (!tx.events.length) {
    return [
      item(
        "judgement-based-prohibitions",
        "買いたたき・協議拒否等（事実認定が必要な禁止行為）",
        "法第5条第1項第1号・第5号〜第7号、第2項第2号〜第4号",
        "not_assessed",
        "記録イベントなし — ツールでは判定しない（人間確認）"
      ),
    ];
  }
  return tx.events.map((event, index) => {
    const rule = EVENT_RULES[event.kind];
    return item(
      `event-${index + 1}-${event.kind}`,
      rule.label,
      rule.article,
      "needs_review",
      `${event.on} ${event.note ?? ""}`.trim()
    );
  });
}

export function checkRecordRetention(tx: SubcontractTransaction): SubcontractCheckItem {
  const label = "取引記録の作成・2年保存";
  const article = "法第7条・記録規則第3条";
  if (!tx.records_completed_on) {
    if (!tx.paid_on)
      return item("records", label, article, "not_applicable", "取引継続中 — 記録未完了");
    return item("records", label, article, "needs_review", "支払済だが記録完了日が未記録");
  }
  const requiredUntil = addYears(tx.records_completed_on, RECORD_RETENTION_YEARS);
  if (!tx.records_retained_until)
    return item(
      "records",
      label,
      article,
      "needs_review",
      `保存期限未設定（必要: ${requiredUntil} まで）`
    );
  if (tx.records_retained_until < requiredUntil) {
    return item(
      "records",
      label,
      article,
      "fail",
      `保存期限 ${tx.records_retained_until} < 必要 ${requiredUntil}`
    );
  }
  return item(
    "records",
    label,
    article,
    "pass",
    `保存期限 ${tx.records_retained_until}（必要 ${requiredUntil}）`
  );
}

export function legacyOrderItem(tx: SubcontractTransaction): SubcontractCheckItem {
  return item(
    "legacy-order",
    "施行日前の発注（旧下請法の例による）",
    "令和7年法律第41号附則",
    "needs_review",
    `発注日 ${tx.ordered_on} < ${TORITEKI_EFFECTIVE_DATE} — 本モジュールは旧法を自動適用しない`
  );
}

export function evaluateTransactionChecks(
  tx: SubcontractTransaction,
  asOf: string
): SubcontractCheckItem[] {
  if (isLegacyOrder(tx.ordered_on)) return [legacyOrderItem(tx)];
  const paperCopy = checkPaperCopy(tx);
  return [
    checkDisclosure(tx),
    ...(paperCopy ? [paperCopy] : []),
    checkPaymentTerm(tx),
    checkPaymentMethod(tx),
    checkLatePayment(tx, asOf),
    checkAmountReduction(tx),
    checkReturns(tx),
    checkPaidMaterials(tx),
    ...checkJudgementEvents(tx),
    checkRecordRetention(tx),
  ];
}

export function summarizeOutcome(items: SubcontractCheckItem[]): TransactionOutcome {
  if (items.some((entry) => entry.status === "fail")) return "fail";
  if (items.some((entry) => entry.status === "needs_review")) return "needs_review";
  return "no_issue_detected";
}
