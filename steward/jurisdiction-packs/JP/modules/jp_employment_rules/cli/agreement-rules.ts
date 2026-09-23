import type {
  AgreementWorkCategory,
  OvertimeAgreement,
} from "../../../../../../schemas/jp-employment-rules.js";
import {
  AGREEMENT_EXPIRY_ALERT_DAYS,
  DRIVING_ANNUAL_OVERTIME_CAP,
  SPECIAL_ANNUAL_OVERTIME_CAP,
  SPECIAL_MAX_MONTHS_OVER_LIMIT,
  SPECIAL_MONTHLY_TOTAL_CAP_EXCLUSIVE,
  STANDARD_ANNUAL_LIMIT_HOURS,
  STANDARD_MONTHLY_LIMIT_HOURS,
  VARIABLE_ANNUAL_LIMIT_HOURS,
  VARIABLE_MONTHLY_LIMIT_HOURS,
  daysFromTo,
  evaluateLaborParty,
  type RuleCheck,
} from "./legal-limits.js";

export interface StatutoryLimits {
  monthly: number;
  annual: number;
}

/** 36条4項の限度時間（1年単位変形・対象期間3か月超は42/320） */
export function statutoryLimits(variableHoursOver3Months: boolean): StatutoryLimits {
  return variableHoursOver3Months
    ? { monthly: VARIABLE_MONTHLY_LIMIT_HOURS, annual: VARIABLE_ANNUAL_LIMIT_HOURS }
    : { monthly: STANDARD_MONTHLY_LIMIT_HOURS, annual: STANDARD_ANNUAL_LIMIT_HOURS };
}

/** 医師（附則141条）・新技術研究開発（36条11項）は上限の読替え・適用除外があり機械判定しない */
export function isLimitCheckDeferred(category: AgreementWorkCategory): boolean {
  return category === "physician" || category === "new_technology_rnd";
}

/** 36条6項2号・3号の実績上限が適用されない区分（附則139条1項・140条1項） */
export function isActualCapExempt(category: AgreementWorkCategory): boolean {
  return category === "construction_disaster_recovery" || category === "motor_vehicle_driving";
}

export function specialAnnualCap(category: AgreementWorkCategory): number {
  return category === "motor_vehicle_driving" ? DRIVING_ANNUAL_OVERTIME_CAP : SPECIAL_ANNUAL_OVERTIME_CAP;
}

const CATEGORY_REVIEW_NOTES: Partial<Record<AgreementWorkCategory, string>> = {
  construction_disaster_recovery: "災害復旧・復興事業: 月100時間未満・2〜6か月平均80時間は不適用（附則139条1項）— 事業該当性を確認",
  motor_vehicle_driving: "自動車運転業務: 特別条項 年960時間（附則140条）· 改善基準告示（拘束時間等）は別途確認",
  physician: "医師: 附則141条・省令の時間（A/B/C水準等）で判定 — 本モジュールは機械判定しない",
  new_technology_rnd: "新技術等の研究開発業務: 36条11項により限度時間等は不適用 · 面接指導等を別途確認",
};

export function categoryReviewCheck(category: AgreementWorkCategory): RuleCheck | null {
  const note = CATEGORY_REVIEW_NOTES[category];
  if (!note) return null;
  return { id: "work-category", label: "業種・業務区分の特例", status: "needs_review", detail: note, basis: "労基法附則139〜141条 · 36条11項" };
}

function requiredItemsCheck(agreement: OvertimeAgreement): RuleCheck {
  const missing = [
    agreement.covered_workers ? null : "対象労働者の範囲",
    agreement.extension_reasons.length ? null : "延長・休日労働させることができる場合",
    agreement.general.daily_hours === undefined ? "1日の延長時間" : null,
  ].filter((m): m is string => m !== null);
  return {
    id: "required-items",
    label: "協定の必要記載事項",
    basis: "労基法36条2項 · 施行規則17条1項1号2号",
    status: missing.length ? "violation" : "ok",
    detail: missing.length ? `欠落: ${missing.join("、")}` : `起算日 ${agreement.period_start} · 有効期間 ${agreement.effective_from}〜${agreement.effective_to}`,
  };
}

export function generalLimitViolations(general: OvertimeAgreement["general"], limits: StatutoryLimits): string[] {
  return [
    general.monthly_hours > limits.monthly ? `月 ${general.monthly_hours}h > ${limits.monthly}h` : null,
    general.annual_hours > limits.annual ? `年 ${general.annual_hours}h > ${limits.annual}h` : null,
  ].filter((v): v is string => v !== null);
}

function generalLimitCheck(agreement: OvertimeAgreement): RuleCheck {
  const limits = statutoryLimits(agreement.variable_hours_over_3_months);
  const violations = generalLimitViolations(agreement.general, limits);
  return {
    id: "general-limits",
    label: "限度時間（一般条項）",
    basis: "労基法36条3項4項",
    status: violations.length ? "violation" : "ok",
    detail: violations.length ? violations.join(" · ") : `月 ${agreement.general.monthly_hours}h · 年 ${agreement.general.annual_hours}h`,
  };
}

type SpecialClause = NonNullable<OvertimeAgreement["special_clause"]>;

export function specialClauseLimitViolations(special: SpecialClause, category: AgreementWorkCategory): string[] {
  const annualCap = specialAnnualCap(category);
  const monthlyApplies = !isActualCapExempt(category);
  const monthsApplies = category !== "motor_vehicle_driving";
  return [
    monthlyApplies && special.monthly_total_hours >= SPECIAL_MONTHLY_TOTAL_CAP_EXCLUSIVE
      ? `月（時間外＋休日） ${special.monthly_total_hours}h は ${SPECIAL_MONTHLY_TOTAL_CAP_EXCLUSIVE}h 未満であること`
      : null,
    special.annual_overtime_hours > annualCap ? `年 ${special.annual_overtime_hours}h > ${annualCap}h` : null,
    monthsApplies && special.max_months_over_limit > SPECIAL_MAX_MONTHS_OVER_LIMIT
      ? `限度時間超の月数 ${special.max_months_over_limit} > ${SPECIAL_MAX_MONTHS_OVER_LIMIT}`
      : null,
  ].filter((v): v is string => v !== null);
}

function specialItemsMissing(special: SpecialClause): string[] {
  return [
    special.circumstances.length ? null : "臨時的に限度時間を超える場合",
    special.health_measures.length ? null : "健康・福祉確保措置",
    special.premium_rate_percent === undefined ? "限度時間超の割増賃金率" : null,
    special.procedure ? null : "限度時間を超える場合の手続",
  ].filter((v): v is string => v !== null);
}

function specialClauseCheck(agreement: OvertimeAgreement): RuleCheck {
  const base = { id: "special-clause", label: "特別条項", basis: "労基法36条5項 · 附則139条140条 · 施行規則17条1項4〜7号" };
  const special = agreement.special_clause;
  if (!special) return { ...base, status: "ok", detail: "特別条項なし（限度時間内のみ）" };
  const issues = [
    ...specialClauseLimitViolations(special, agreement.work_category),
    ...specialItemsMissing(special).map((m) => `欠落: ${m}`),
  ];
  if (issues.length) return { ...base, status: "violation", detail: issues.join(" · ") };
  return {
    ...base,
    status: "ok",
    detail: `月 ${special.monthly_total_hours}h · 年 ${special.annual_overtime_hours}h · ${special.max_months_over_limit}か月`,
  };
}

function statutoryCapsConfirmedCheck(agreement: OvertimeAgreement): RuleCheck | null {
  if (isActualCapExempt(agreement.work_category)) return null;
  return {
    id: "statutory-caps-confirmed",
    label: "月100時間未満・2〜6か月平均80時間以内を満たす旨の定め",
    basis: "施行規則17条1項3号",
    status: agreement.confirms_statutory_caps ? "ok" : "violation",
    detail: agreement.confirms_statutory_caps ? "定めあり（チェックボックス）" : "定めなし",
  };
}

function filingCheck(agreement: OvertimeAgreement): RuleCheck {
  const base = { id: "agreement-filed", label: "労働基準監督署への届出", basis: "労基法36条1項 · 施行規則16条" };
  if (!agreement.filed_on) return { ...base, status: "violation", detail: "届出日が未記録（届出前は時間外・休日労働不可）" };
  if (agreement.filed_on > agreement.effective_from) {
    return {
      ...base,
      status: "violation",
      detail: `届出 ${agreement.filed_on} が有効期間開始 ${agreement.effective_from} より後 — 届出前の時間外・休日労働は不可`,
    };
  }
  return { ...base, status: "ok", detail: `届出 ${agreement.filed_on}` };
}

export function validityCheck(agreement: OvertimeAgreement, asOf: string, hasSuccessor: boolean): RuleCheck {
  const base = { id: "validity", label: "有効期間・期限", basis: "施行規則17条1項1号" };
  if (asOf < agreement.effective_from) return { ...base, status: "ok", detail: `未発効（${agreement.effective_from} から）` };
  const daysLeft = daysFromTo(asOf, agreement.effective_to);
  if (daysLeft < 0) {
    return hasSuccessor
      ? { ...base, status: "ok", detail: `${agreement.effective_to} 失効 · 後継協定あり` }
      : { ...base, status: "violation", detail: `${agreement.effective_to} 失効 · 後継協定なし（時間外・休日労働不可）` };
  }
  if (daysLeft <= AGREEMENT_EXPIRY_ALERT_DAYS && !hasSuccessor) {
    return { ...base, status: "alert", detail: `残り ${daysLeft} 日（${agreement.effective_to}）· 更新協定の締結・届出を準備` };
  }
  return { ...base, status: "ok", detail: `残り ${daysLeft} 日（${agreement.effective_to}）` };
}

function notificationCheck(agreement: OvertimeAgreement): RuleCheck {
  const base = { id: "agreement-notified", label: "労働者への周知", basis: "労基法106条" };
  if (!agreement.notification) return { ...base, status: "violation", detail: "周知方法・周知日が未記録" };
  return { ...base, status: "ok", detail: `${agreement.notification.method} · ${agreement.notification.notified_on}` };
}

function limitChecks(agreement: OvertimeAgreement): RuleCheck[] {
  if (isLimitCheckDeferred(agreement.work_category)) return [];
  const confirmed = statutoryCapsConfirmedCheck(agreement);
  return [generalLimitCheck(agreement), specialClauseCheck(agreement), ...(confirmed ? [confirmed] : [])];
}

export function evaluateAgreement(agreement: OvertimeAgreement, asOf: string, hasSuccessor: boolean): RuleCheck[] {
  const categoryCheck = categoryReviewCheck(agreement.work_category);
  return [
    ...(categoryCheck ? [categoryCheck] : []),
    requiredItemsCheck(agreement),
    ...limitChecks(agreement),
    evaluateLaborParty(agreement.party, "overtime_agreement"),
    filingCheck(agreement),
    validityCheck(agreement, asOf, hasSuccessor),
    notificationCheck(agreement),
  ];
}

export function hasSuccessorAgreement(agreement: OvertimeAgreement, all: readonly OvertimeAgreement[]): boolean {
  return all.some(
    (other) =>
      other.id !== agreement.id &&
      other.workplace_id === agreement.workplace_id &&
      other.effective_from > agreement.effective_from &&
      other.effective_from <= addOneDay(agreement.effective_to)
  );
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
