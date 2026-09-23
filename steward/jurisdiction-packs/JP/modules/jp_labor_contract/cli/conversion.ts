import {
  addDays,
  addMonths,
  addYears,
  formatPeriodLength,
  periodLength,
  type PeriodLength,
} from "./dates.js";

/** 労働契約法の一部を改正する法律（平成24年法律56号）附則2項: この日以後に始まる有期契約のみ通算 */
export const CONVERSION_RULE_FIRST_START = "2013-04-01";

/** 労契法18条1項: 通算契約期間が5年を超えると無期転換申込権 */
export const CONVERSION_THRESHOLD_MONTHS = 60;

/** 労契法18条2項: 空白期間6か月以上でクーリング（直前の通算が1年未満なら省令2条の期間） */
export const COOLING_MAX_MONTHS = 6;

/** 通算契約期間に関する基準を定める省令（平成24年厚労省令148号）1条2項: 端数日の合算は30日を1か月 */
export const DAYS_PER_MONTH_FOR_FRACTIONS = 30;

/** 同省令1条1項・2条: 直前の通算期間の2分の1（1か月未満切上げ） */
export const COOLING_RATIO_DENOMINATOR = 2;

/** 有期労働契約の締結、更新、雇止め等に関する基準（平成15年厚労告357号）2条: 3回以上更新 */
export const NON_RENEWAL_NOTICE_MIN_RENEWALS = 3;

/** 同告示2条: 雇入れの日から起算して1年を超えて継続勤務 */
export const NON_RENEWAL_NOTICE_SERVICE_YEARS = 1;

/** 同告示2条: 満了日の30日前までに予告 */
export const NON_RENEWAL_NOTICE_DAYS = 30;

export interface FixedTermPeriod {
  contract_id?: string;
  start_date: string;
  end_date: string;
}

export interface ConversionSegment {
  periods: FixedTermPeriod[];
  cumulative: PeriodLength;
  hasInternalGaps: boolean;
}

export function sumPeriodLengths(lengths: readonly PeriodLength[]): PeriodLength {
  const months = lengths.reduce((total, length) => total + length.months, 0);
  const days = lengths.reduce((total, length) => total + length.days, 0);
  return {
    months: months + Math.floor(days / DAYS_PER_MONTH_FOR_FRACTIONS),
    days: days % DAYS_PER_MONTH_FOR_FRACTIONS,
  };
}

export function coolingThresholdMonths(cumulative: PeriodLength): number {
  const totalDays = cumulative.months * DAYS_PER_MONTH_FOR_FRACTIONS + cumulative.days;
  const halfMonthsRoundedUp = Math.ceil(
    totalDays / (DAYS_PER_MONTH_FOR_FRACTIONS * COOLING_RATIO_DENOMINATOR)
  );
  return Math.min(COOLING_MAX_MONTHS, halfMonthsRoundedUp);
}

export function hasGap(previousEnd: string, nextStart: string): boolean {
  return addDays(previousEnd, 1) < nextStart;
}

/** True when the gap between two contracts resets the cumulative period (クーリング). */
export function isCoolingGap(
  previousEnd: string,
  nextStart: string,
  cumulativeBeforeGap: PeriodLength
): boolean {
  if (!hasGap(previousEnd, nextStart)) return false;
  const gapStart = addDays(previousEnd, 1);
  return addMonths(gapStart, coolingThresholdMonths(cumulativeBeforeGap)) <= nextStart;
}

export function exceedsConversionThreshold(cumulative: PeriodLength): boolean {
  if (cumulative.months !== CONVERSION_THRESHOLD_MONTHS)
    return cumulative.months > CONVERSION_THRESHOLD_MONTHS;
  return cumulative.days > 0;
}

/** Sorted, de-duplicated periods eligible for 通算; `overlap` flags inconsistent history. */
export function normalizePeriods(periods: readonly FixedTermPeriod[]): {
  periods: FixedTermPeriod[];
  overlap: boolean;
} {
  const unique = new Map<string, FixedTermPeriod>();
  for (const period of periods) {
    if (period.start_date < CONVERSION_RULE_FIRST_START) continue;
    const key = `${period.start_date}/${period.end_date}`;
    unique.set(key, { ...unique.get(key), ...period });
  }
  const sorted = [...unique.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const overlap = sorted.some(
    (period, index) => index > 0 && period.start_date <= sorted[index - 1].end_date
  );
  return { periods: sorted, overlap };
}

/** The trailing segment after the last cooling reset (periods must be normalized). */
export function currentSegment(periods: readonly FixedTermPeriod[]): ConversionSegment {
  let segment: FixedTermPeriod[] = [];
  let cumulative: PeriodLength = { months: 0, days: 0 };
  let hasInternalGaps = false;
  for (const period of periods) {
    const previous = segment[segment.length - 1];
    const length = periodLength(period.start_date, period.end_date);
    if (previous && isCoolingGap(previous.end_date, period.start_date, cumulative)) {
      segment = [period];
      cumulative = length;
      hasInternalGaps = false;
      continue;
    }
    if (previous && hasGap(previous.end_date, period.start_date)) hasInternalGaps = true;
    segment = [...segment, period];
    cumulative = sumPeriodLengths([cumulative, length]);
  }
  return { periods: segment, cumulative, hasInternalGaps };
}

/**
 * 労基則5条5項: true when the application right arises within `contract` (cumulative including it > 5年).
 * null when the history is inconsistent.
 */
export function conversionRightArisesWithin(
  history: readonly FixedTermPeriod[],
  contract: FixedTermPeriod
): boolean | null {
  if (contract.start_date < CONVERSION_RULE_FIRST_START) return false;
  const upToContract = history.filter((period) => period.start_date <= contract.start_date);
  const normalized = normalizePeriods([...upToContract, contract]);
  if (normalized.overlap) return null;
  return exceedsConversionThreshold(currentSegment(normalized.periods).cumulative);
}

export function projectNextTerm(current: FixedTermPeriod): FixedTermPeriod {
  const length = periodLength(current.start_date, current.end_date);
  const start = addDays(current.end_date, 1);
  const endExclusive = addDays(addMonths(start, length.months), length.days);
  return { start_date: start, end_date: addDays(endExclusive, -1) };
}

export interface NonRenewalNotice {
  required: boolean | null;
  deadline: string;
  renewals: number;
  reason: string;
}

function trailingContinuousChain(periods: readonly FixedTermPeriod[]): FixedTermPeriod[] {
  let start = periods.length - 1;
  while (start > 0 && !hasGap(periods[start - 1].end_date, periods[start].start_date)) start -= 1;
  return periods.slice(start);
}

function meetsNoticeThreshold(chain: readonly FixedTermPeriod[]): boolean {
  const renewals = chain.length - 1;
  const hireDate = chain[0].start_date;
  const currentEnd = chain[chain.length - 1].end_date;
  return (
    renewals >= NON_RENEWAL_NOTICE_MIN_RENEWALS ||
    currentEnd >= addYears(hireDate, NON_RENEWAL_NOTICE_SERVICE_YEARS)
  );
}

/** 雇止め告示2条 — `segment.periods` must end with the current contract. */
export function assessNonRenewalNotice(
  segment: ConversionSegment,
  nonRenewalSpecifiedInAdvance: boolean
): NonRenewalNotice {
  const chain = trailingContinuousChain(segment.periods);
  const current = chain[chain.length - 1];
  const deadline = addDays(current.end_date, -NON_RENEWAL_NOTICE_DAYS);
  const renewals = chain.length - 1;
  if (nonRenewalSpecifiedInAdvance) {
    return { required: false, deadline, renewals, reason: "あらかじめ更新しない旨を明示済み" };
  }
  if (meetsNoticeThreshold(chain)) {
    return {
      required: true,
      deadline,
      renewals,
      reason: "3回以上更新または雇入れから1年超の継続勤務",
    };
  }
  if (segment.hasInternalGaps && meetsNoticeThreshold(segment.periods)) {
    return {
      required: null,
      deadline,
      renewals,
      reason: "空白期間を挟む — 継続勤務の実態を人間が確認",
    };
  }
  return { required: false, deadline, renewals, reason: "更新2回以下かつ継続勤務1年以下" };
}

export function describeCumulative(cumulative: PeriodLength): string {
  return formatPeriodLength(cumulative);
}
