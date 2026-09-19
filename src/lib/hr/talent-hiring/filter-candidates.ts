import {
  talentCandidateSchema,
  type ScoredCandidate,
  type StructuredRFP,
  type TalentCandidate,
} from "../../../../schemas/talent-hiring.js";

function hasRequiredSkills(rfp: StructuredRFP, candidate: TalentCandidate): boolean {
  return rfp.must_have_skills.every((skill) => candidate.skills.includes(skill));
}

function isEligible(rfp: StructuredRFP, candidate: TalentCandidate): boolean {
  if (!hasRequiredSkills(rfp, candidate)) return false;
  if (candidate.hourly_rate > rfp.budget.max_hourly_rate) return false;
  if (candidate.years < rfp.min_years) return false;
  return true;
}

function scoreOf(rfp: StructuredRFP, candidate: TalentCandidate): number {
  const matches = rfp.must_have_skills.filter((skill) => candidate.skills.includes(skill)).length;
  return matches + candidate.years;
}

function byScoreThenId(left: ScoredCandidate, right: ScoredCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.candidate_id < right.candidate_id) return -1;
  if (left.candidate_id > right.candidate_id) return 1;
  return 0;
}

export function filterCandidates(
  rfp: StructuredRFP,
  candidates: TalentCandidate[],
  topN: number,
): ScoredCandidate[] {
  if (topN <= 0) return [];
  return candidates
    .map((candidate) => talentCandidateSchema.parse(candidate))
    .filter((candidate) => isEligible(rfp, candidate))
    .map((candidate) => ({ ...candidate, score: scoreOf(rfp, candidate) }))
    .sort(byScoreThenId)
    .slice(0, topN);
}
