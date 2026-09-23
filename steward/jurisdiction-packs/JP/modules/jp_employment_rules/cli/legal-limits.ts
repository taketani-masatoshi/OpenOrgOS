import type { LaborParty } from "../../../../../../schemas/jp-employment-rules.js";

/** 労働基準法89条: 常時10人以上の労働者を使用する使用者（事業場単位）に作成・届出義務 */
export const WORK_RULES_HEADCOUNT_THRESHOLD = 10;

/** 労働基準法36条4項: 限度時間 1か月45時間・1年360時間 */
export const STANDARD_MONTHLY_LIMIT_HOURS = 45;
export const STANDARD_ANNUAL_LIMIT_HOURS = 360;

/** 労働基準法36条4項括弧書: 32条の4（対象期間3か月超の1年単位変形労働時間制）は月42時間・年320時間 */
export const VARIABLE_MONTHLY_LIMIT_HOURS = 42;
export const VARIABLE_ANNUAL_LIMIT_HOURS = 320;

/** 労働基準法36条5項: 特別条項の月の時間外＋休日労働は100時間未満 */
export const SPECIAL_MONTHLY_TOTAL_CAP_EXCLUSIVE = 100;
/** 労働基準法36条5項: 特別条項の年の時間外労働は720時間以内 */
export const SPECIAL_ANNUAL_OVERTIME_CAP = 720;
/** 労働基準法36条5項後段: 限度時間を超えることができる月数は1年について6か月以内 */
export const SPECIAL_MAX_MONTHS_OVER_LIMIT = 6;

/** 労働基準法36条6項2号: 実績の時間外＋休日労働は1か月100時間未満 */
export const ACTUAL_MONTHLY_TOTAL_CAP_EXCLUSIVE = 100;
/** 労働基準法36条6項3号: 直前2〜6か月の時間外＋休日労働の月平均80時間以内 */
export const ACTUAL_ROLLING_AVERAGE_CAP = 80;
export const ROLLING_WINDOW_MIN_MONTHS = 2;
export const ROLLING_WINDOW_MAX_MONTHS = 6;

/** 労働基準法附則140条1項: 自動車運転の業務の特別条項 年960時間以内（36条5項後段・6項2号3号は不適用） */
export const DRIVING_ANNUAL_OVERTIME_CAP = 960;

/** 労働基準法36条2項2号: 対象期間は1年間に限る */
export const TARGET_PERIOD_MONTHS = 12;

/** 運用上の期限アラート（法定期限ではない） */
export const AGREEMENT_EXPIRY_ALERT_DAYS = 30;

export type CheckStatus = "ok" | "alert" | "violation" | "needs_review";

export interface RuleCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  basis?: string;
}

const STATUS_SEVERITY: Record<CheckStatus, number> = {
  ok: 0,
  alert: 1,
  needs_review: 2,
  violation: 3,
};

export function overallStatus(checks: readonly RuleCheck[]): CheckStatus {
  return checks.reduce<CheckStatus>(
    (worst, c) => (STATUS_SEVERITY[c.status] > STATUS_SEVERITY[worst] ? c.status : worst),
    "ok"
  );
}

export function jurisdictionCheck(jurisdictionCode: string): RuleCheck {
  const isJp = jurisdictionCode === "JP";
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    status: isJp ? "ok" : "violation",
    detail: isJp ? "JP" : `current: ${jurisdictionCode} — 本モジュールは日本の労働基準法のみ対象`,
  };
}

const MS_PER_DAY = 86_400_000;

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysFromTo(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / MS_PER_DAY);
}

const MONTHS_PER_YEAR = 12;

export function monthIndex(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return y * MONTHS_PER_YEAR + (m - 1);
}

export function monthLabel(index: number): string {
  const y = Math.floor(index / MONTHS_PER_YEAR);
  const m = (index % MONTHS_PER_YEAR) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export type PartyContext = "work_rules_opinion" | "overtime_agreement";

/**
 * 過半数代表者の要件（労基法施行規則6条の2）。
 * 管理監督者は原則不可。ただし就業規則の意見聴取（90条1項）は管理監督者以外がいない事業場に限り可（同条2項）。
 */
export function evaluateLaborParty(party: LaborParty | undefined, context: PartyContext): RuleCheck {
  const base = { id: "labor-party", label: "過半数組合／過半数代表者", basis: "労基法施行規則6条の2" };
  if (!party) return { ...base, status: "violation", detail: "労働者側当事者が未記録" };
  if (party.type === "majority_union") {
    return party.union_name
      ? { ...base, status: "ok", detail: `過半数組合: ${party.union_name}` }
      : { ...base, status: "needs_review", detail: "過半数組合の名称が未記録" };
  }
  if (!party.representative_employee_id || !party.selection_method) {
    return { ...base, status: "needs_review", detail: "代表者 employee_id または選出方法が未記録" };
  }
  if (party.selection_method === "employer_appointed") {
    return { ...base, status: "violation", detail: "使用者の指名による選出は不可（6条の2第1項2号）" };
  }
  return evaluateRepresentativeManagerStatus(party, context, base);
}

function evaluateRepresentativeManagerStatus(
  party: LaborParty,
  context: PartyContext,
  base: Pick<RuleCheck, "id" | "label" | "basis">
): RuleCheck {
  const who = `代表者 ${party.representative_employee_id}（${party.selection_method}）`;
  if (party.representative_is_manager === undefined) {
    return { ...base, status: "needs_review", detail: `${who} · 管理監督者該当性が未記録` };
  }
  if (!party.representative_is_manager) return { ...base, status: "ok", detail: who };
  if (context === "work_rules_opinion") {
    return { ...base, status: "needs_review", detail: `${who} · 管理監督者以外がいない事業場か確認（6条の2第2項）` };
  }
  return { ...base, status: "violation", detail: `${who} · 管理監督者は36協定の過半数代表者になれない` };
}
