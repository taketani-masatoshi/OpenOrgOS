import { createHash } from "node:crypto";
import type { ContractTerms, PassKeyApprovalPayload } from "../../../../schemas/talent-hiring.js";
import { canonicalJson } from "../../protocol/canonical.js";

export function talentApprovalPayload(input: {
  title: string;
  shortlist: Array<{ candidate_id: string }>;
  terms: ContractTerms;
}): PassKeyApprovalPayload {
  return {
    rfp_title: input.title,
    candidate_ids: input.shortlist.map((candidate) => candidate.candidate_id),
    terms: input.terms,
  };
}

export function payloadHash(payload: PassKeyApprovalPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
