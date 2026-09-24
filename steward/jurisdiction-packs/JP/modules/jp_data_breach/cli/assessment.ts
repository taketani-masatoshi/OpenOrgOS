import type {
  BreachFactFlag,
  BreachFlags,
  BreachIncident,
} from "../../../../../../schemas/jp-data-breach.js";

/** 施行規則7条4号 — 本人の数が「千人を超える」（1,000 ちょうどは非該当） */
export const AFFECTED_COUNT_THRESHOLD = 1000;

/** 施行規則8条2項 — 確報は知った日から30日以内 */
export const FINAL_REPORT_DAYS = 30;

/** 施行規則8条2項括弧書 — 7条3号事態（他号と重複する場合を含む · 通則編GL 3-5-3-4）は60日以内 */
export const FINAL_REPORT_DAYS_UNLAWFUL_PURPOSE = 60;

export type ReportTrigger =
  "sensitive" | "financial_harm_risk" | "unlawful_purpose" | "over_threshold";

export type AssessmentStatus = "reportable" | "not_reportable" | "needs_review";

export type BreachObligation =
  "report_and_notify" | "entrustee_exempt" | "entrustee_pending_notice" | "none";

export const REPORT_TRIGGER_LABELS: Record<ReportTrigger, string> = {
  sensitive: "①要配慮個人情報が含まれる個人データ（施行規則7条1号）",
  financial_harm_risk: "②不正利用により財産的被害が生じるおそれ（施行規則7条2号）",
  unlawful_purpose:
    "③不正の目的をもって行われたおそれ（施行規則7条3号 · 取得しようとしている個人情報を含む）",
  over_threshold: "④本人の数が1,000人超（施行規則7条4号）",
};

const REVIEW_REASONS = {
  sensitive: "①要配慮個人情報の有無が未確認",
  financialHarm: "②財産的被害のおそれの有無が未確認（クレジットカード番号・送金可能な認証情報等）",
  unlawfulPurpose: "③不正の目的のおそれの有無が未確認（該当すれば確報60日）",
  intendedForDatabase: "③取得しようとしている個人情報を個人データとして取り扱う予定か未確認",
  affectedCount: "④本人の数が不明で最大数（affected_count_upper_bound）も未記載",
  encryption: "高度な暗号化その他の保護措置の有無が未確認",
  keyCompromise: "高度な暗号化あり — 復号鍵の漏えい有無が未確認（除外判断保留）",
  recipientUndetermined: "報告先（個人情報保護委員会／権限委任先の事業所管大臣）が未確定",
  recipientDelegated:
    "権限委任先省庁の最新一覧を確認（自社の雇用管理情報・株主情報は個人情報保護委員会へ）",
  notificationAlternative: "本人通知の代替措置 — 通知困難の該当性（法26条2項ただし書）を確認",
} as const;

export interface ExclusionOutcome {
  applied: boolean;
  needsReview: string[];
}

export interface BreachAssessment {
  incident_id: string;
  status: AssessmentStatus;
  triggered: ReportTrigger[];
  triggered_labels: string[];
  exclusion_applied: boolean;
  needs_review: string[];
  obligation: BreachObligation;
  provisional: boolean;
  final_report_days: number | null;
}

interface RuleOutcome {
  triggered: ReportTrigger[];
  needsReview: string[];
}

const NO_OUTCOME: RuleOutcome = { triggered: [], needsReview: [] };

export function exceedsAffectedThreshold(count: number): boolean {
  return count > AFFECTED_COUNT_THRESHOLD;
}

function evaluateFlag(
  value: BreachFactFlag,
  trigger: ReportTrigger,
  reviewReason: string
): RuleOutcome {
  if (value === true) return { triggered: [trigger], needsReview: [] };
  if (value === "unknown") return { triggered: [], needsReview: [reviewReason] };
  return NO_OUTCOME;
}

function coversPersonalData(incident: BreachIncident): boolean {
  return incident.data_scope !== "being_acquired";
}

/** 施行規則7条柱書〜1号括弧書「以下この条…において同じ」— 高度な暗号化等の除外は1〜4号すべてに及ぶ */
export function evaluateEncryptionExclusion(flags: BreachFlags): ExclusionOutcome {
  if (flags.encrypted_high_level === false) return { applied: false, needsReview: [] };
  if (flags.encrypted_high_level === "unknown") {
    return { applied: false, needsReview: [REVIEW_REASONS.encryption] };
  }
  if (flags.encryption_key_compromised === false) return { applied: true, needsReview: [] };
  if (flags.encryption_key_compromised === true) return { applied: false, needsReview: [] };
  return { applied: false, needsReview: [REVIEW_REASONS.keyCompromise] };
}

function evaluateSensitive(incident: BreachIncident): RuleOutcome {
  if (!coversPersonalData(incident)) return NO_OUTCOME;
  return evaluateFlag(incident.flags.sensitive, "sensitive", REVIEW_REASONS.sensitive);
}

function evaluateFinancialHarm(incident: BreachIncident): RuleOutcome {
  if (!coversPersonalData(incident)) return NO_OUTCOME;
  return evaluateFlag(
    incident.flags.financial_harm_risk,
    "financial_harm_risk",
    REVIEW_REASONS.financialHarm
  );
}

/** 施行規則7条3号括弧書（2024-04-01 施行）— 取得しようとしている個人情報は「個人データとして取り扱う予定」の場合のみ */
function evaluateUnlawfulPurpose(incident: BreachIncident): RuleOutcome {
  const flagOutcome = evaluateFlag(
    incident.flags.unlawful_purpose,
    "unlawful_purpose",
    REVIEW_REASONS.unlawfulPurpose
  );
  if (incident.data_scope !== "being_acquired" || incident.intended_for_database === true)
    return flagOutcome;
  if (incident.intended_for_database === false || incident.flags.unlawful_purpose === false)
    return NO_OUTCOME;
  return {
    triggered: [],
    needsReview: [...flagOutcome.needsReview, REVIEW_REASONS.intendedForDatabase],
  };
}

/** 通則編GL 3-5-3-1(4) — 本人の数が確定できない場合は最大数で判定 */
function evaluateAffectedCount(incident: BreachIncident): RuleOutcome {
  if (!coversPersonalData(incident)) return NO_OUTCOME;
  const { affected_count: count, affected_count_upper_bound: upperBound } = incident;
  if (count === "unknown" && upperBound === undefined) {
    return { triggered: [], needsReview: [REVIEW_REASONS.affectedCount] };
  }
  const maxCount = Math.max(count === "unknown" ? 0 : count, upperBound ?? 0);
  return exceedsAffectedThreshold(maxCount)
    ? { triggered: ["over_threshold"], needsReview: [] }
    : NO_OUTCOME;
}

function procedureReviews(incident: BreachIncident, status: AssessmentStatus): string[] {
  if (status === "not_reportable") return [];
  const reviews: string[] = [];
  if (incident.report_recipient === "undetermined")
    reviews.push(REVIEW_REASONS.recipientUndetermined);
  if (incident.report_recipient === "delegated_minister")
    reviews.push(REVIEW_REASONS.recipientDelegated);
  if (incident.notification_alternative) reviews.push(REVIEW_REASONS.notificationAlternative);
  return reviews;
}

function resolveObligation(incident: BreachIncident, status: AssessmentStatus): BreachObligation {
  if (status === "not_reportable") return "none";
  if (!incident.is_entrustee) return "report_and_notify";
  return incident.entrustor_notified_on ? "entrustee_exempt" : "entrustee_pending_notice";
}

export function finalReportDays(triggered: readonly ReportTrigger[]): number {
  return triggered.includes("unlawful_purpose")
    ? FINAL_REPORT_DAYS_UNLAWFUL_PURPOSE
    : FINAL_REPORT_DAYS;
}

function resolveStatus(
  triggered: readonly ReportTrigger[],
  needsReview: readonly string[]
): AssessmentStatus {
  if (triggered.length > 0) return "reportable";
  return needsReview.length > 0 ? "needs_review" : "not_reportable";
}

/** 法26条1項 · 施行規則7条 — 報告対象事態の判定（準備支援 · 最終判断は人間） */
export function assessIncident(incident: BreachIncident): BreachAssessment {
  const exclusion = evaluateEncryptionExclusion(incident.flags);
  const outcomes = exclusion.applied
    ? []
    : [
        evaluateSensitive(incident),
        evaluateFinancialHarm(incident),
        evaluateUnlawfulPurpose(incident),
        evaluateAffectedCount(incident),
      ];
  const triggered = outcomes.flatMap((o) => o.triggered);
  const ruleReviews = [...exclusion.needsReview, ...outcomes.flatMap((o) => o.needsReview)];
  const status = resolveStatus(triggered, ruleReviews);
  return {
    incident_id: incident.id,
    status,
    triggered,
    triggered_labels: triggered.map((t) => REPORT_TRIGGER_LABELS[t]),
    exclusion_applied: exclusion.applied,
    needs_review: [...ruleReviews, ...procedureReviews(incident, status)],
    obligation: resolveObligation(incident, status),
    provisional: status === "needs_review",
    final_report_days: status === "not_reportable" ? null : finalReportDays(triggered),
  };
}
