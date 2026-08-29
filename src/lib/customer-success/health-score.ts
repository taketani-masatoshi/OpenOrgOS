/**
 * Deterministic customer health score — pure function from rubric + account context.
 */
import type {
  CustomerAccount,
  CustomerHealthStatus,
  CustomerHealthSignal,
  CustomerNpsResponse,
  CustomerOnboarding,
} from "../../../schemas/customer-success/index.js";
import type { HealthRubric } from "./health-rubric.js";
import { daysBetween } from "../utils.js";

export interface HealthScoreFactor {
  id: string;
  penalty: number;
  detail: string;
}

export interface AccountHealthInput {
  account: CustomerAccount;
  asOf: string;
  latestSignal?: CustomerHealthSignal;
  latestNps?: CustomerNpsResponse;
  onboarding?: CustomerOnboarding;
}

export interface AccountHealthResult {
  account_id: string;
  company: string;
  score: number;
  declared: CustomerHealthStatus;
  recommended: CustomerHealthStatus;
  drift: boolean;
  factors: HealthScoreFactor[];
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreToRecommended(
  score: number,
  rubric: HealthRubric,
): Exclude<CustomerHealthStatus, "churned"> {
  if (score >= rubric.thresholds.healthy_min) return "healthy";
  if (score >= rubric.thresholds.at_risk_min) return "at_risk";
  return "critical";
}

function penaltyContactRecency(
  account: CustomerAccount,
  asOf: string,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!account.last_contact_on) return undefined;
  const days = daysBetween(account.last_contact_on, asOf);
  const p = rubric.penalties.contact_recency;
  if (days <= p.days_healthy) return undefined;
  let penalty = 0;
  if (days <= p.days_at_risk) {
    penalty = Math.round(p.max * 0.4);
  } else if (days <= p.days_critical) {
    penalty = Math.round(p.max * 0.7);
  } else {
    penalty = p.max;
  }
  return {
    id: "contact_recency",
    penalty,
    detail: `最終接触から ${days} 日`,
  };
}

function penaltyActionOverdue(
  account: CustomerAccount,
  asOf: string,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!account.next_action_due) return undefined;
  const days = daysBetween(account.next_action_due, asOf);
  if (days <= rubric.penalties.action_overdue.days_grace) return undefined;
  const overdue = Math.max(0, days);
  const penalty = Math.min(
    rubric.penalties.action_overdue.max,
    overdue * 2,
  );
  return {
    id: "action_overdue",
    penalty,
    detail: `次アクション ${overdue} 日超過`,
  };
}

function penaltyRenewalProximity(
  account: CustomerAccount,
  asOf: string,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!account.renewal_date || account.health === "churned") return undefined;
  const remaining = daysBetween(asOf, account.renewal_date);
  if (remaining < 0) {
    return {
      id: "renewal_proximity",
      penalty: rubric.penalties.renewal_proximity.max,
      detail: "更新期日超過",
    };
  }
  const p = rubric.penalties.renewal_proximity;
  if (remaining > p.days_healthy) return undefined;
  let penalty = 0;
  if (remaining <= p.days_critical) {
    penalty = p.max;
  } else if (remaining <= p.days_at_risk) {
    penalty = Math.round(p.max * 0.7);
  } else {
    penalty = Math.round(p.max * 0.4);
  }
  return {
    id: "renewal_proximity",
    penalty,
    detail: `更新まで ${remaining} 日`,
  };
}

function penaltyUsageIndex(
  signal: CustomerHealthSignal | undefined,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!signal) return undefined;
  const p = rubric.penalties.usage_index;
  const idx = signal.usage_index;
  if (idx >= p.healthy_min) return undefined;
  let penalty = 0;
  if (idx >= p.at_risk_min) {
    penalty = Math.round(p.max * 0.5);
  } else {
    penalty = p.max;
  }
  return {
    id: "usage_index",
    penalty,
    detail: `利用指数 ${idx}`,
  };
}

function penaltySupportPressure(
  signal: CustomerHealthSignal | undefined,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!signal) return undefined;
  const p = rubric.penalties.support_pressure;
  let penalty = 0;
  const tickets = signal.open_tickets ?? 0;
  if (tickets > p.tickets_at_risk_max) {
    penalty += p.max;
  } else if (tickets > p.tickets_healthy_max) {
    penalty += Math.round(p.max * 0.5);
  }
  const escalations = signal.escalations_90d ?? 0;
  if (escalations > 0) {
    penalty += Math.min(p.escalations_penalty * escalations, p.max);
  }
  if (penalty === 0) return undefined;
  return {
    id: "support_pressure",
    penalty: Math.min(penalty, p.max),
    detail: `open_tickets=${tickets} escalations_90d=${escalations}`,
  };
}

function penaltyNpsLatest(
  nps: CustomerNpsResponse | undefined,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!nps) return undefined;
  const p = rubric.penalties.nps_latest;
  const score = nps.score;
  if (score >= p.promoter_min) return undefined;
  let penalty = 0;
  if (score <= p.detractor_max) {
    penalty = p.max;
  } else if (score >= p.passive_min) {
    penalty = Math.round(p.max * 0.4);
  } else {
    penalty = Math.round(p.max * 0.7);
  }
  return {
    id: "nps_latest",
    penalty,
    detail: `NPS ${score}`,
  };
}

function penaltyOnboardingDelay(
  onboarding: CustomerOnboarding | undefined,
  asOf: string,
  rubric: HealthRubric,
): HealthScoreFactor | undefined {
  if (!onboarding) return undefined;
  const p = rubric.penalties.onboarding_delay;
  let maxOverdue = 0;
  for (const m of onboarding.milestones) {
    if (m.status === "done") continue;
    const overdue = daysBetween(m.due, asOf);
    if (overdue > p.milestone_overdue_days) {
      maxOverdue = Math.max(maxOverdue, overdue);
    }
  }
  if (maxOverdue === 0) return undefined;
  const penalty = Math.min(p.max, Math.round(maxOverdue / 7) * 2);
  return {
    id: "onboarding_delay",
    penalty,
    detail: `マイルストーン ${maxOverdue} 日遅延`,
  };
}

export function computeAccountHealth(
  input: AccountHealthInput,
  rubric: HealthRubric,
): AccountHealthResult {
  const { account, asOf, latestSignal, latestNps, onboarding } = input;

  if (account.health === "churned") {
    return {
      account_id: account.id,
      company: account.company,
      score: 0,
      declared: "churned",
      recommended: "churned",
      drift: false,
      factors: [],
    };
  }

  const factors: HealthScoreFactor[] = [];
  const candidates = [
    penaltyContactRecency(account, asOf, rubric),
    penaltyActionOverdue(account, asOf, rubric),
    penaltyRenewalProximity(account, asOf, rubric),
    penaltyUsageIndex(latestSignal, rubric),
    penaltySupportPressure(latestSignal, rubric),
    penaltyNpsLatest(latestNps, rubric),
    penaltyOnboardingDelay(onboarding, asOf, rubric),
  ];
  for (const f of candidates) {
    if (f) factors.push(f);
  }

  const totalPenalty = factors.reduce((sum, f) => sum + f.penalty, 0);
  const score = clampScore(100 - totalPenalty);
  const recommended = scoreToRecommended(score, rubric);
  const drift = account.health !== recommended;

  return {
    account_id: account.id,
    company: account.company,
    score,
    declared: account.health ?? "healthy",
    recommended,
    drift,
    factors,
  };
}

export function latestByAccountId<T extends { account_id: string; observed_on?: string; surveyed_on?: string }>(
  items: T[],
  dateField: "observed_on" | "surveyed_on",
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const date = item[dateField];
    if (!date) continue;
    const prev = map.get(item.account_id);
    if (!prev || (prev[dateField] ?? "") < date) {
      map.set(item.account_id, item);
    }
  }
  return map;
}

export function onboardingByAccountId(
  onboardings: CustomerOnboarding[],
): Map<string, CustomerOnboarding> {
  const map = new Map<string, CustomerOnboarding>();
  for (const o of onboardings) {
    const prev = map.get(o.account_id);
    if (!prev || o.started_on > prev.started_on) {
      map.set(o.account_id, o);
    }
  }
  return map;
}
