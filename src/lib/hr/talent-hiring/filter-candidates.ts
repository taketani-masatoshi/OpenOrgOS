import type { JobPosting, TalentCandidate } from "../../../../schemas/talent-hiring.js";

const TRIAL_CHECKS = [
  "learns_procedure",
  "follows_any_supervisor",
  "adapts_to_one_change",
  "reports_exceptions",
  "safe_workwear",
] as const;

function passedEveryCheck(candidate: TalentCandidate): boolean {
  return TRIAL_CHECKS.every((check) => candidate[check]);
}

function byHourlyThenId(left: TalentCandidate, right: TalentCandidate): number {
  if (left.hourly_rate !== right.hourly_rate) return left.hourly_rate - right.hourly_rate;
  if (left.candidate_id < right.candidate_id) return -1;
  if (left.candidate_id > right.candidate_id) return 1;
  return 0;
}

export function filterCandidates(posting: JobPosting, candidates: TalentCandidate[]): TalentCandidate[] {
  return candidates
    .filter(
      (candidate) =>
        passedEveryCheck(candidate) && candidate.hourly_rate <= posting.max_hourly_rate,
    )
    .sort(byHourlyThenId)
    .slice(0, posting.headcount);
}
