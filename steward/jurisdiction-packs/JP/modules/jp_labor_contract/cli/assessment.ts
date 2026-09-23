import type {
  FixedTermHistoryPeriod,
  LaborContract,
  MinimumWagesFile,
} from "../../../../../../schemas/jp-labor-contract.js";
import {
  jurisdictionCheck,
  summarizeStatus,
  type CheckItem,
  type OverallStatus,
} from "./checks.js";
import {
  assessNonRenewalNotice,
  conversionRightArisesWithin,
  currentSegment,
  describeCumulative,
  exceedsConversionThreshold,
  normalizePeriods,
  projectNextTerm,
  type FixedTermPeriod,
  type NonRenewalNotice,
} from "./conversion.js";
import { laterDate } from "./dates.js";
import { assessDisclosures } from "./disclosures.js";
import { assessMinimumWage } from "./minimum-wage.js";
import { assessFixedTermLength, assessProbation, assessRenewalCapExplanation } from "./terms.js";

export interface ContractCheckResult {
  contract_id: string;
  employee_id: string;
  status: OverallStatus;
  passed: boolean;
  checks: CheckItem[];
}

export interface ContractCheckContext {
  asOf: string;
  jurisdictionCode: string;
  minimumWages: MinimumWagesFile;
  /** The same employee's fixed-term periods (history and other contracts). */
  employeePeriods: readonly FixedTermPeriod[];
}

function contractPeriod(contract: LaborContract): FixedTermPeriod | null {
  if (contract.contract_type !== "fixed_term" || !contract.end_date) return null;
  return { contract_id: contract.id, start_date: contract.start_date, end_date: contract.end_date };
}

export function evaluateContract(
  contract: LaborContract,
  context: ContractCheckContext
): ContractCheckResult {
  const period = contractPeriod(contract);
  const conversionRightArises = period
    ? conversionRightArisesWithin(context.employeePeriods, period)
    : false;
  const checks: CheckItem[] = [
    jurisdictionCheck(context.jurisdictionCode),
    ...assessDisclosures({ contract, conversionRightArises }),
    assessFixedTermLength({
      contractType: contract.contract_type,
      startDate: contract.start_date,
      endDate: contract.end_date,
      termBasis: contract.term_basis,
      ageAtConclusion: contract.age_at_conclusion,
    }),
    assessProbation(contract),
    assessRenewalCapExplanation(contract),
    assessMinimumWage({
      wage: contract.wage,
      prefecture: contract.workplace_prefecture,
      onDate: laterDate(context.asOf, contract.start_date),
      table: context.minimumWages,
    }),
  ];
  const status = summarizeStatus(checks);
  return {
    contract_id: contract.id,
    employee_id: contract.employee_id,
    status,
    passed: status === "ok",
    checks,
  };
}

export type ConversionStatus = "ok" | "attention" | "needs_review";

export interface EmployeeConversionAssessment {
  employee_id: string;
  status: ConversionStatus;
  current_contract: FixedTermPeriod | null;
  segment_start: string | null;
  cumulative_months: number;
  cumulative_days: number;
  cumulative_label: string;
  conversion_right_now: boolean;
  conversion_right_at_next_renewal: boolean | null;
  next_term: (FixedTermPeriod & { projected: boolean }) | null;
  non_renewal_notice: NonRenewalNotice | null;
  alerts: string[];
  review_reasons: string[];
}

export interface EmployeeConversionInput {
  employeeId: string;
  periods: readonly FixedTermPeriod[];
  asOf: string;
  currentContract: LaborContract | null;
}

/** Employee's fixed-term periods from contracts and history (history-only periods keep their contract_id). */
export function collectFixedTermPeriods(
  employeeId: string,
  contracts: readonly LaborContract[],
  history: readonly FixedTermHistoryPeriod[]
): FixedTermPeriod[] {
  const fromContracts = contracts
    .filter((contract) => contract.employee_id === employeeId)
    .map(contractPeriod)
    .filter((period): period is FixedTermPeriod => period !== null);
  const fromHistory = history
    .filter((period) => period.employee_id === employeeId)
    .map(({ contract_id, start_date, end_date }) => ({ contract_id, start_date, end_date }));
  return [...fromHistory, ...fromContracts];
}

function emptyAssessment(
  employeeId: string,
  reviewReasons: string[]
): EmployeeConversionAssessment {
  return {
    employee_id: employeeId,
    status: reviewReasons.length ? "needs_review" : "ok",
    current_contract: null,
    segment_start: null,
    cumulative_months: 0,
    cumulative_days: 0,
    cumulative_label: describeCumulative({ months: 0, days: 0 }),
    conversion_right_now: false,
    conversion_right_at_next_renewal: false,
    next_term: null,
    non_renewal_notice: null,
    alerts: [],
    review_reasons: reviewReasons,
  };
}

function resolveNextTerm(
  eligible: readonly FixedTermPeriod[],
  current: FixedTermPeriod,
  renewal: LaborContract["renewal"] | undefined
): (FixedTermPeriod & { projected: boolean }) | null {
  const scheduled = eligible.find((period) => period.start_date > current.end_date);
  if (scheduled) return { ...scheduled, projected: false };
  if (renewal === "none") return null;
  return { ...projectNextTerm(current), projected: true };
}

/** 雇止め告示2条括弧書: 契約で「更新しない」と定めた場合も予告対象外 */
function nonRenewalSpecifiedInAdvance(contract: LaborContract | null): boolean {
  if (!contract) return false;
  return contract.non_renewal_specified_in_advance || contract.renewal === "none";
}

function baseReviewReasons(input: EmployeeConversionInput, overlap: boolean): string[] {
  const reasons: string[] = [];
  if (overlap) reasons.push("有期契約の期間が重複 — 履歴を確認");
  const special = input.currentContract?.conversion_special_measure ?? "none";
  if (special !== "none") reasons.push(`無期転換の特例（${special}）— 認定・適用要件を人間が確認`);
  return reasons;
}

export function assessEmployeeConversion(
  input: EmployeeConversionInput
): EmployeeConversionAssessment {
  const normalized = normalizePeriods(input.periods);
  const reviewReasons = baseReviewReasons(input, normalized.overlap);
  const started = normalized.periods.filter((period) => period.start_date <= input.asOf);
  const current = started[started.length - 1];
  if (!current || current.end_date < input.asOf) {
    return emptyAssessment(input.employeeId, reviewReasons);
  }
  const segment = currentSegment(started);
  const rightNow = exceedsConversionThreshold(segment.cumulative);
  const nextTerm = resolveNextTerm(normalized.periods, current, input.currentContract?.renewal);
  const rightAtNext = nextTerm
    ? !rightNow && exceedsConversionThreshold(currentSegment([...started, nextTerm]).cumulative)
    : false;
  const notice = assessNonRenewalNotice(
    segment,
    nonRenewalSpecifiedInAdvance(input.currentContract)
  );
  const alerts = conversionAlerts({ current, rightNow, rightAtNext, nextTerm });
  const noticeFindings = noticeAlerts(
    notice,
    input.currentContract?.renewal_intent ?? "undecided",
    input.asOf
  );
  const allReviews = [...reviewReasons, ...noticeFindings.reviews];
  const allAlerts = [...alerts, ...noticeFindings.alerts];
  return {
    employee_id: input.employeeId,
    status: conversionStatus(allReviews, allAlerts),
    current_contract: current,
    segment_start: segment.periods[0]?.start_date ?? null,
    cumulative_months: segment.cumulative.months,
    cumulative_days: segment.cumulative.days,
    cumulative_label: describeCumulative(segment.cumulative),
    conversion_right_now: rightNow,
    conversion_right_at_next_renewal: rightAtNext,
    next_term: nextTerm,
    non_renewal_notice: notice,
    alerts: allAlerts,
    review_reasons: allReviews,
  };
}

function conversionStatus(
  reviewReasons: readonly string[],
  alerts: readonly string[]
): ConversionStatus {
  if (reviewReasons.length) return "needs_review";
  return alerts.length ? "attention" : "ok";
}

function conversionAlerts(input: {
  current: FixedTermPeriod;
  rightNow: boolean;
  rightAtNext: boolean;
  nextTerm: (FixedTermPeriod & { projected: boolean }) | null;
}): string[] {
  if (input.rightNow)
    return [
      `無期転換申込権あり — 現契約満了 ${input.current.end_date} まで申込可能（労契法18条1項）`,
    ];
  if (!input.rightAtNext || !input.nextTerm) return [];
  const basis = input.nextTerm.projected ? "同期間で更新した場合" : "予定契約";
  return [
    `次回契約（${input.nextTerm.start_date}〜・${basis}）で申込権発生 — 無期転換申込機会と転換後の労働条件の明示が必要（労基則5条5項）`,
  ];
}

function noticeAlerts(
  notice: NonRenewalNotice,
  intent: LaborContract["renewal_intent"],
  asOf: string
): { alerts: string[]; reviews: string[] } {
  if (notice.required === null)
    return { alerts: [], reviews: [`雇止め予告の要否: ${notice.reason}`] };
  if (!notice.required) return { alerts: [], reviews: [] };
  if (intent === "renew") return { alerts: [], reviews: [] };
  const overdue = asOf > notice.deadline;
  if (intent === "undecided") {
    const text = overdue
      ? `更新しない場合の予告期限 ${notice.deadline} を経過 — 更新方針を至急確認`
      : `更新しない場合は ${notice.deadline} までに予告（雇止め告示2条）`;
    return { alerts: [text], reviews: [] };
  }
  const alert = overdue
    ? `雇止め予告期限 ${notice.deadline} を経過（雇止め告示2条）`
    : `雇止め予告期限 ${notice.deadline}（雇止め告示2条）`;
  return { alerts: [alert], reviews: ["雇止めの有効性（労契法19条）は人間が判断"] };
}
