import { createHash } from "node:crypto";
import type {
  ContractTerms,
  PassKeyApprovalPayload,
  RegularPrerequisites,
} from "../../../../schemas/talent-hiring.js";
import { canonicalJson } from "../../protocol/canonical.js";

export function talentApprovalPayload(input: {
  title: string;
  shortlist: Array<{ candidate_id: string }>;
  terms: ContractTerms;
  prerequisites?: RegularPrerequisites;
}): PassKeyApprovalPayload {
  const payload: PassKeyApprovalPayload = {
    rfp_title: input.title,
    candidate_ids: input.shortlist.map((candidate) => candidate.candidate_id),
    terms: input.terms,
    engagement: input.terms.engagement,
  };
  if (input.terms.engagement === "regular" && input.prerequisites) {
    payload.prerequisites = {
      work_rules_ref: input.prerequisites.work_rules_ref,
      dismissal_ground_refs: input.prerequisites.dismissal_ground_refs,
      notice_procedure: input.prerequisites.notice_procedure,
      probation_days: input.prerequisites.probation_days,
    };
  }
  return payload;
}

export function payloadHash(payload: PassKeyApprovalPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
