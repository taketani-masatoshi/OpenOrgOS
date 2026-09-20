import {
  contractTermsSchema,
  engagementKindSchema,
  jobPostingSchema,
  regularPrerequisitesSchema,
  talentCandidateSchema,
  type TalentCandidate,
} from "../../../schemas/talent-hiring.js";
import { filterCandidates } from "./talent-hiring/filter-candidates.js";
import {
  proposeShortTermTalentApproval,
  type ShortTermTalentApprovalResult,
} from "./talent-hiring/propose-approval.js";

const FORBIDDEN_KEYS = ["age", "gender", "birth_date"] as const;

export type TalentShortlistResult =
  | { status: "rejected"; reason: string }
  | { status: "need_prerequisites"; missing: string[] }
  | ({ status: "ready"; shortlist: TalentCandidate[] } & ShortTermTalentApprovalResult);

export interface TalentShortlistInput {
  posting: unknown;
  candidates: unknown;
  terms: unknown;
  prerequisites?: unknown;
  proposedBy: string;
  operatorId: string;
  approverId: string;
  apiOrigin: string;
}

function forbiddenKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function missingRegularPrerequisites(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [
      "work_rules_ref",
      "dismissal_ground_refs",
      "notice_procedure",
      "probation_days",
      "labor_conditions",
    ];
  }
  const row = value as Record<string, unknown>;
  const missing: string[] = [];
  if (!row.work_rules_ref) missing.push("work_rules_ref");
  if (!Array.isArray(row.dismissal_ground_refs) || row.dismissal_ground_refs.length === 0) {
    missing.push("dismissal_ground_refs");
  }
  if (!row.notice_procedure) missing.push("notice_procedure");
  if (row.probation_days === undefined || row.probation_days === null) missing.push("probation_days");
  const labor = row.labor_conditions;
  if (!labor || typeof labor !== "object" || Array.isArray(labor)) {
    missing.push("labor_conditions");
  } else {
    const conditions = labor as Record<string, unknown>;
    if (conditions.period_fixed === undefined) missing.push("labor_conditions.period_fixed");
    if (!conditions.wage) missing.push("labor_conditions.wage");
    if (!conditions.work_hours) missing.push("labor_conditions.work_hours");
    if (!conditions.workplace) missing.push("labor_conditions.workplace");
  }
  return missing;
}

export function shortlistForPosting(input: TalentShortlistInput): TalentShortlistResult {
  const postingForbidden = forbiddenKeys(input.posting);
  if (postingForbidden.length > 0) {
    return { status: "rejected", reason: `年齢・性別では選考しない（${postingForbidden.join(", ")}）` };
  }
  if (!Array.isArray(input.candidates)) {
    return { status: "rejected", reason: "候補者は配列で渡してください" };
  }
  const candidateForbidden = [...new Set(input.candidates.flatMap((row) => forbiddenKeys(row)))];
  if (candidateForbidden.length > 0) {
    return { status: "rejected", reason: `年齢・性別では選考しない（${candidateForbidden.join(", ")}）` };
  }

  const posting = jobPostingSchema.safeParse(input.posting);
  if (!posting.success) return { status: "rejected", reason: "求人票を読めません" };
  const terms = contractTermsSchema.safeParse(input.terms);
  if (!terms.success) {
    const engagement = engagementKindSchema.safeParse(
      input.terms && typeof input.terms === "object" && !Array.isArray(input.terms)
        ? (input.terms as { engagement?: unknown }).engagement
        : undefined,
    );
    if (!engagement.success) return { status: "rejected", reason: "契約形態を選んでください" };
    return { status: "rejected", reason: "契約条件を読めません" };
  }

  let prerequisites;
  if (terms.data.engagement === "regular") {
    const missing = missingRegularPrerequisites(input.prerequisites);
    if (missing.length > 0) return { status: "need_prerequisites", missing };
    const parsedPrereqs = regularPrerequisitesSchema.safeParse(input.prerequisites);
    if (!parsedPrereqs.success) return { status: "need_prerequisites", missing: ["prerequisites"] };
    prerequisites = parsedPrereqs.data;
  }

  const parsed: TalentCandidate[] = [];
  for (const row of input.candidates) {
    const candidate = talentCandidateSchema.safeParse(row);
    if (!candidate.success) return { status: "rejected", reason: "候補者の形式が不正です" };
    parsed.push(candidate.data);
  }

  const shortlist = filterCandidates(posting.data, parsed);
  const approval = proposeShortTermTalentApproval({
    title: posting.data.title,
    shortlist,
    terms: terms.data,
    prerequisites,
    proposedBy: input.proposedBy,
    operatorId: input.operatorId,
    approverId: input.approverId,
    apiOrigin: input.apiOrigin,
  });
  return { status: "ready", shortlist, ...approval };
}
