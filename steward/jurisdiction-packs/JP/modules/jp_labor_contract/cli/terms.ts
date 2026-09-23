import type { LaborContract } from "../../../../../../schemas/jp-labor-contract.js";
import type { CheckItem } from "./checks.js";
import { addYears, formatPeriodLength, periodLength } from "./dates.js";

/** 労基法14条1項本文: 有期労働契約の上限 */
export const FIXED_TERM_STANDARD_MAX_YEARS = 3;

/** 労基法14条1項1号・2号: 高度専門職 · 満60歳以上の上限 */
export const FIXED_TERM_EXTENDED_MAX_YEARS = 5;

/** 労基法14条1項2号: 満60歳以上 */
export const FIXED_TERM_SENIOR_AGE = 60;

/**
 * 試用期間の長さに法定上限はない。長期の試用期間は公序良俗違反とされ得るため（ブラザー工業事件 名古屋地判昭59.3.23）、
 * この月数を超える場合は人間レビューに回す運用閾値。
 */
export const PROBATION_REVIEW_THRESHOLD_MONTHS = 6;

/** 労基法21条4号: 試の使用期間中の者は14日を超えると解雇予告（20条）の対象 */
export const PROBATION_NOTICE_EXEMPT_DAYS = 14;

export interface FixedTermLengthInput {
  contractType: LaborContract["contract_type"];
  startDate: string;
  endDate?: string;
  termBasis: LaborContract["term_basis"];
  ageAtConclusion?: number;
}

const TERM_BASIS = "労基法14条1項";

function termItem(status: CheckItem["status"], detail: string): CheckItem {
  return {
    id: "fixed-term-max-length",
    label: "有期契約期間の上限",
    status,
    detail,
    basis: TERM_BASIS,
  };
}

/** True when the inclusive period [start, end] is longer than `years` years. */
export function exceedsYears(startDate: string, endDate: string, years: number): boolean {
  return endDate >= addYears(startDate, years);
}

export function assessFixedTermLength(input: FixedTermLengthInput): CheckItem {
  if (input.contractType === "indefinite") return termItem("not_applicable", "期間の定めなし");
  if (!input.endDate) return termItem("ng", "有期契約に end_date がない");
  if (input.endDate < input.startDate) return termItem("ng", "end_date が start_date より前");
  const length = formatPeriodLength(periodLength(input.startDate, input.endDate));
  if (input.termBasis === "project_completion") {
    return termItem(
      "needs_review",
      `${length} · 一定の事業の完了に必要な期間 — 事業の実態を人間が確認`
    );
  }
  if (!exceedsYears(input.startDate, input.endDate, FIXED_TERM_STANDARD_MAX_YEARS)) {
    return termItem("ok", `${length} ≤ ${FIXED_TERM_STANDARD_MAX_YEARS}年`);
  }
  if (exceedsYears(input.startDate, input.endDate, FIXED_TERM_EXTENDED_MAX_YEARS)) {
    return termItem("ng", `${length} > ${FIXED_TERM_EXTENDED_MAX_YEARS}年`);
  }
  return assessExtendedTerm(input, length);
}

function assessExtendedTerm(input: FixedTermLengthInput, length: string): CheckItem {
  if (input.ageAtConclusion !== undefined && input.ageAtConclusion >= FIXED_TERM_SENIOR_AGE) {
    return termItem(
      "ok",
      `${length} · 締結時満${FIXED_TERM_SENIOR_AGE}歳以上（上限${FIXED_TERM_EXTENDED_MAX_YEARS}年）`
    );
  }
  if (input.termBasis === "advanced_professional") {
    return termItem(
      "needs_review",
      `${length} · 高度専門職の基準（平成15年厚労告356号）該当性を人間が確認`
    );
  }
  if (input.ageAtConclusion === undefined) {
    return termItem(
      "needs_review",
      `${length} > ${FIXED_TERM_STANDARD_MAX_YEARS}年 · 締結時年齢が未設定`
    );
  }
  return termItem("ng", `${length} > ${FIXED_TERM_STANDARD_MAX_YEARS}年（特例に該当しない）`);
}

function probationItem(status: CheckItem["status"], detail: string): CheckItem {
  return {
    id: "probation",
    label: "試用期間",
    status,
    detail,
    basis: "労基法21条4号 · 判例（長期試用期間）",
  };
}

export function assessProbation(contract: LaborContract): CheckItem {
  const months = contract.probation_months;
  if (months === undefined || months === 0) return probationItem("not_applicable", "試用期間なし");
  const noticeNote = `${PROBATION_NOTICE_EXEMPT_DAYS}日超で解雇予告の対象`;
  if (months > PROBATION_REVIEW_THRESHOLD_MONTHS) {
    return probationItem(
      "needs_review",
      `${months}か月 > ${PROBATION_REVIEW_THRESHOLD_MONTHS}か月 — 合理性を人間が確認 · ${noticeNote}`
    );
  }
  if (contract.contract_type === "fixed_term" && contract.end_date) {
    const term = periodLength(contract.start_date, contract.end_date);
    if (months >= term.months) {
      return probationItem(
        "needs_review",
        `${months}か月が契約期間（${formatPeriodLength(term)}）以上 — 設定の妥当性を確認`
      );
    }
  }
  return probationItem("ok", `${months}か月 · ${noticeNote}`);
}

function capItem(status: CheckItem["status"], detail: string): CheckItem {
  return {
    id: "renewal-cap-explanation",
    label: "更新上限の新設・短縮時の事前説明",
    status,
    detail,
    basis: "有期労働契約の締結、更新、雇止め等に関する基準（告示）1条",
  };
}

export function assessRenewalCapExplanation(contract: LaborContract): CheckItem {
  const cap = contract.renewal_cap;
  if (contract.contract_type !== "fixed_term" || cap.type === "none")
    return capItem("not_applicable", "更新上限なし");
  if (!cap.introduced_or_shortened_after_initial) return capItem("ok", "当初から設定された上限");
  if (!cap.reason_explained_on) return capItem("ng", "新設・短縮の理由説明日が未記録");
  if (cap.reason_explained_on > contract.concluded_on) {
    return capItem(
      "ng",
      `説明日 ${cap.reason_explained_on} が締結日 ${contract.concluded_on} より後`
    );
  }
  return capItem("ok", `理由説明 ${cap.reason_explained_on}`);
}
