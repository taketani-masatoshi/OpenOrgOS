import { createHash } from "node:crypto";
import {
  passKeyApprovalRequestSchema,
  type BuildPassKeyPayloadInput,
  type PassKeyApprovalPayload,
  type PassKeyApprovalRequest,
} from "../../../../schemas/talent-hiring.js";
import { canonicalJson } from "../../protocol/canonical.js";

function approvalPayload(input: BuildPassKeyPayloadInput): PassKeyApprovalPayload {
  return {
    rfp_title: input.rfp.title,
    candidate_ids: input.shortlist.map((candidate) => candidate.candidate_id),
    terms: input.terms,
  };
}

export function payloadHash(payload: PassKeyApprovalPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function buildPassKeyPayload(input: BuildPassKeyPayloadInput): PassKeyApprovalRequest {
  const payload = approvalPayload(input);
  return passKeyApprovalRequestSchema.parse({
    request_id: input.id ?? "",
    ceremony_kind: "settlement",
    created_at: input.clock?.() ?? "",
    payload,
    payload_hash: payloadHash(payload),
  });
}
