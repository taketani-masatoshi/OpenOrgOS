import {
  contractTermsSchema,
  jobPostingSchema,
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
  | ({ status: "ready"; shortlist: TalentCandidate[] } & ShortTermTalentApprovalResult);

export interface TalentShortlistInput {
  posting: unknown;
  candidates: unknown;
  terms: unknown;
  proposedBy: string;
  operatorId: string;
  approverId: string;
  apiOrigin: string;
}

function forbiddenKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
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
  if (!terms.success) return { status: "rejected", reason: "契約条件を読めません" };

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
    proposedBy: input.proposedBy,
    operatorId: input.operatorId,
    approverId: input.approverId,
    apiOrigin: input.apiOrigin,
  });
  return { status: "ready", shortlist, ...approval };
}
