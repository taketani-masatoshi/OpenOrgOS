import type { OrgApprovalRequest } from "../../../../schemas/org/approval.js";
import type {
  ContractTerms,
  EngagementKind,
  PassKeyApprovalPayload,
  RegularPrerequisites,
} from "../../../../schemas/talent-hiring.js";
import { proposeOrgApproval } from "../../org/approval/propose.js";
import {
  createSettlementChallenge,
  isSettlementStepUpEnabled,
} from "../../org/settlement-stepup.js";
import { payloadHash, talentApprovalPayload } from "./passkey-payload.js";

const SUBJECT_TYPE: Record<EngagementKind, string> = {
  contractor: "talent_contractor",
  fixed_term: "talent_fixed_term",
  regular: "talent_regular",
};

export interface ProposeShortTermTalentInput {
  title: string;
  shortlist: Array<{ candidate_id: string }>;
  terms: ContractTerms;
  prerequisites?: RegularPrerequisites;
  proposedBy: string;
  operatorId: string;
  approverId: string;
  apiOrigin: string;
}

export interface TalentSettlementWait {
  ceremony_kind: "settlement";
  challenge_id: string;
  token: string;
  webauthn_challenge: string;
  rp_id: string;
  expires_at: string;
}

export interface ShortTermTalentApprovalResult {
  approval: OrgApprovalRequest;
  payload: PassKeyApprovalPayload;
  payload_hash: string;
  settlement_required: boolean;
  settlement?: TalentSettlementWait;
}

export function proposeShortTermTalentApproval(
  input: ProposeShortTermTalentInput,
): ShortTermTalentApprovalResult {
  const payload = talentApprovalPayload(input);
  const hash = payloadHash(payload);
  const approval = proposeOrgApproval({
    scope: "internal",
    subjectType: SUBJECT_TYPE[input.terms.engagement],
    proposedBy: input.proposedBy,
    subjectRef: hash,
    message: input.title,
    amount: { value: input.terms.max_total, currency: input.terms.currency },
  });

  if (!isSettlementStepUpEnabled()) {
    return {
      approval,
      payload,
      payload_hash: hash,
      settlement_required: false,
    };
  }

  const created = createSettlementChallenge({
    approval,
    operatorId: input.operatorId,
    approverId: input.approverId,
    apiOrigin: input.apiOrigin,
    force: true,
  });

  return {
    approval,
    payload,
    payload_hash: hash,
    settlement_required: true,
    settlement: {
      ceremony_kind: created.ceremony_kind,
      challenge_id: created.challenge.challenge_id,
      token: created.challenge.token,
      webauthn_challenge: created.challenge.webauthn_challenge,
      rp_id: created.challenge.rp_id,
      expires_at: created.challenge.expires_at,
    },
  };
}
