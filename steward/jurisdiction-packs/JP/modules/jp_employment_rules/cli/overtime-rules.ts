import type {
  OvertimeAgreement,
  OvertimeMonth,
  OvertimeRecord,
} from "../../../../../../schemas/jp-employment-rules.js";
import {
  categoryReviewCheck,
  isActualCapExempt,
  isLimitCheckDeferred,
  specialAnnualCap,
  statutoryLimits,
} from "./agreement-rules.js";
import {
  ACTUAL_MONTHLY_TOTAL_CAP_EXCLUSIVE,
  ACTUAL_ROLLING_AVERAGE_CAP,
  ROLLING_WINDOW_MAX_MONTHS,
  ROLLING_WINDOW_MIN_MONTHS,
  SPECIAL_MAX_MONTHS_OVER_LIMIT,
  TARGET_PERIOD_MONTHS,
  monthIndex,
  monthLabel,
  type RuleCheck,
} from "./legal-limits.js";

export function totalHours(month: OvertimeMonth): number {
  return month.overtime_hours + month.holiday_work_hours;
}

export function exceedsMonthlyTotalCap(month: OvertimeMonth): boolean {
  return totalHours(month) >= ACTUAL_MONTHLY_TOTAL_CAP_EXCLUSIVE;
}

export interface RollingAverageFinding {
  month: string;
  windowMonths: number;
  averageHours: number;
}

export interface RollingAverageResult {
  violations: RollingAverageFinding[];
  missingWindows: string[];
}

const WINDOW_SPANS = Array.from(
  { length: ROLLING_WINDOW_MAX_MONTHS - ROLLING_WINDOW_MIN_MONTHS + 1 },
  (_, i) => ROLLING_WINDOW_MIN_MONTHS + i
);

interface WindowOutcome {
  month: string;
  span: number;
  averageHours: number | null;
}

function windowMonths(month: string, span: number): string[] {
  const end = monthIndex(month);
  return Array.from({ length: span }, (_, i) => monthLabel(end - span + 1 + i));
}

function windowOutcome(byMonth: ReadonlyMap<string, OvertimeMonth>, month: string, span: number): WindowOutcome {
  const window = windowMonths(month, span)
    .map((label) => byMonth.get(label))
    .filter((m): m is OvertimeMonth => m !== undefined);
  if (window.length < span) return { month, span, averageHours: null };
  return { month, span, averageHours: window.reduce((sum, m) => sum + totalHours(m), 0) / span };
}

/** 36条6項3号: 各月について直前1〜5か月を加えた2〜6か月の月平均（時間外＋休日） */
export function rollingAverageFindings(
  byMonth: ReadonlyMap<string, OvertimeMonth>,
  evaluatedMonths: readonly string[]
): RollingAverageResult {
  const outcomes = evaluatedMonths.flatMap((month) => WINDOW_SPANS.map((span) => windowOutcome(byMonth, month, span)));
  const violations = outcomes.flatMap((o) =>
    o.averageHours !== null && o.averageHours > ACTUAL_ROLLING_AVERAGE_CAP
      ? [{ month: o.month, windowMonths: o.span, averageHours: o.averageHours }]
      : []
  );
  const missingWindows = outcomes.filter((o) => o.averageHours === null).map((o) => `${o.month}/${o.span}か月`);
  return { violations, missingWindows };
}

/** 協定の対象期間（起算日の月から1年）のうち対象月までの月 */
export function periodMonthsUpTo(periodStart: string, targetMonth: string): string[] {
  const start = monthIndex(periodStart.slice(0, 7));
  const end = Math.min(monthIndex(targetMonth), start + TARGET_PERIOD_MONTHS - 1);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => monthLabel(start + i));
}

export function isWithinTargetPeriod(periodStart: string, targetMonth: string): boolean {
  const offset = monthIndex(targetMonth) - monthIndex(periodStart.slice(0, 7));
  return offset >= 0 && offset < TARGET_PERIOD_MONTHS;
}

export function monthsOverAgreedLimit(months: readonly OvertimeMonth[], agreedMonthlyHours: number): string[] {
  return months.filter((m) => m.overtime_hours > agreedMonthlyHours).map((m) => m.month);
}

/** 特別条項あり: 年の時間外（休日除く）上限 = min(協定, 36条5項/附則140条) · なし: min(協定, 36条4項) */
export function effectiveAnnualCap(agreement: OvertimeAgreement): number {
  const special = agreement.special_clause;
  if (special) return Math.min(special.annual_overtime_hours, specialAnnualCap(agreement.work_category));
  return Math.min(agreement.general.annual_hours, statutoryLimits(agreement.variable_hours_over_3_months).annual);
}

/** 特別条項がある場合に限度時間を超えられる月数 = min(協定, 6) */
export function allowedMonthsOverLimit(agreement: OvertimeAgreement): number {
  const special = agreement.special_clause;
  if (!special) return 0;
  return Math.min(special.max_months_over_limit, SPECIAL_MAX_MONTHS_OVER_LIMIT);
}

export function agreementMonthlyBreaches(months: readonly OvertimeMonth[], agreement: OvertimeAgreement): string[] {
  const special = agreement.special_clause;
  return months
    .filter((m) =>
      special ? totalHours(m) > special.monthly_total_hours : m.overtime_hours > agreement.general.monthly_hours
    )
    .map((m) => `${m.month}(${m.overtime_hours}+${m.holiday_work_hours}h)`);
}

interface OvertimeContext {
  agreement: OvertimeAgreement;
  byMonth: ReadonlyMap<string, OvertimeMonth>;
  periodMonths: string[];
  recordedPeriodMonths: OvertimeMonth[];
}

function coverageCheck(ctx: OvertimeContext): RuleCheck {
  const missing = ctx.periodMonths.filter((label) => !ctx.byMonth.has(label));
  return {
    id: "records-coverage",
    label: "実績の登録状況",
    status: missing.length ? "needs_review" : "ok",
    detail: missing.length ? `未登録月: ${missing.join("、")}` : `${ctx.periodMonths[0]}〜${ctx.periodMonths.at(-1)} 登録済`,
  };
}

function exemptActualCapCheck(id: string, label: string): RuleCheck {
  return { id, label, status: "needs_review", detail: "当該業務区分は36条6項2号3号が不適用（附則139条1項・140条1項）— 別基準で確認", basis: "労基法附則139条140条" };
}

function monthlyTotalCheck(ctx: OvertimeContext): RuleCheck {
  const id = "actual-monthly-under-100";
  const label = "月の時間外＋休日労働 100時間未満";
  if (isActualCapExempt(ctx.agreement.work_category)) return exemptActualCapCheck(id, label);
  const breaches = ctx.recordedPeriodMonths.filter(exceedsMonthlyTotalCap);
  return {
    id,
    label,
    basis: "労基法36条6項2号",
    status: breaches.length ? "violation" : "ok",
    detail: breaches.length ? breaches.map((m) => `${m.month}: ${totalHours(m)}h`).join("、") : "超過なし",
  };
}

function rollingAverageCheck(ctx: OvertimeContext): RuleCheck {
  const id = "actual-rolling-average-80";
  const label = "2〜6か月平均 80時間以内";
  if (isActualCapExempt(ctx.agreement.work_category)) return exemptActualCapCheck(id, label);
  const recorded = ctx.recordedPeriodMonths.map((m) => m.month);
  const { violations, missingWindows } = rollingAverageFindings(ctx.byMonth, recorded);
  const base = { id, label, basis: "労基法36条6項3号" };
  if (violations.length) {
    const detail = violations.map((v) => `${v.month} 直近${v.windowMonths}か月平均 ${v.averageHours.toFixed(1)}h`).join("、");
    return { ...base, status: "violation", detail };
  }
  if (missingWindows.length) {
    return { ...base, status: "needs_review", detail: `実績欠落のため未評価: ${missingWindows.join("、")}` };
  }
  return { ...base, status: "ok", detail: "超過なし" };
}

function agreementMonthlyCheck(ctx: OvertimeContext): RuleCheck {
  const breaches = agreementMonthlyBreaches(ctx.recordedPeriodMonths, ctx.agreement);
  const special = ctx.agreement.special_clause;
  const limitLabel = special ? `特別条項 月 ${special.monthly_total_hours}h（時間外＋休日）` : `一般条項 月 ${ctx.agreement.general.monthly_hours}h`;
  return {
    id: "agreement-monthly",
    label: `協定の月間上限（${limitLabel}）`,
    basis: "労基法32条 · 36条1項（協定の範囲外は違反）",
    status: breaches.length ? "violation" : "ok",
    detail: breaches.length ? breaches.join("、") : "協定内",
  };
}

function monthsOverLimitCheck(ctx: OvertimeContext): RuleCheck | null {
  if (!ctx.agreement.special_clause || ctx.agreement.work_category === "motor_vehicle_driving") return null;
  const over = monthsOverAgreedLimit(ctx.recordedPeriodMonths, ctx.agreement.general.monthly_hours);
  const allowed = allowedMonthsOverLimit(ctx.agreement);
  return {
    id: "months-over-limit",
    label: `一般条項の月間時間（${ctx.agreement.general.monthly_hours}h）超の月数 ≤ ${allowed}`,
    basis: "労基法36条5項後段（協定で定めた回数 · 上限6か月）",
    status: over.length > allowed ? "violation" : "ok",
    detail: `${over.length} か月${over.length ? `（${over.join("、")}）` : ""}`,
  };
}

function annualCheck(ctx: OvertimeContext): RuleCheck {
  const cap = effectiveAnnualCap(ctx.agreement);
  const total = ctx.recordedPeriodMonths.reduce((sum, m) => sum + m.overtime_hours, 0);
  return {
    id: "annual-overtime",
    label: `年の時間外労働（休日除く）≤ ${cap}h`,
    basis: "労基法36条4項5項 · 附則140条",
    status: total > cap ? "violation" : "ok",
    detail: `対象期間累計 ${total}h`,
  };
}

function buildContext(record: OvertimeRecord, agreement: OvertimeAgreement, targetMonth: string): OvertimeContext {
  const byMonth = new Map(record.months.map((m) => [m.month, m] as const));
  const periodMonths = periodMonthsUpTo(agreement.period_start, targetMonth);
  const recordedPeriodMonths = periodMonths
    .map((label) => byMonth.get(label))
    .filter((m): m is OvertimeMonth => m !== undefined);
  return { agreement, byMonth, periodMonths, recordedPeriodMonths };
}

export function evaluateEmployeeOvertime(
  record: OvertimeRecord,
  agreement: OvertimeAgreement,
  targetMonth: string
): RuleCheck[] {
  const categoryCheck = categoryReviewCheck(agreement.work_category);
  if (isLimitCheckDeferred(agreement.work_category) && categoryCheck) return [categoryCheck];
  if (!isWithinTargetPeriod(agreement.period_start, targetMonth)) {
    return [{ id: "target-period", label: "協定の対象期間", status: "needs_review", detail: `${targetMonth} は協定 ${agreement.id} の対象期間外` }];
  }
  const ctx = buildContext(record, agreement, targetMonth);
  const monthsCheck = monthsOverLimitCheck(ctx);
  return [
    ...(categoryCheck ? [categoryCheck] : []),
    coverageCheck(ctx),
    monthlyTotalCheck(ctx),
    rollingAverageCheck(ctx),
    agreementMonthlyCheck(ctx),
    ...(monthsCheck ? [monthsCheck] : []),
    annualCheck(ctx),
  ];
}
