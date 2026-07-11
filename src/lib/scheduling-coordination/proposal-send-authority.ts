import type {
  SchedulingCase,
  SchedulingProposalSendAuthority,
} from "../../../schemas/executive/scheduling-cases.js";
import { assertApproverAuthorized } from "../org/authorized-approvers.js";
import { isHumanApproverOperatorId } from "../correspondence/human-approval.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

/** counter 3 回目以降は CEO 手動判断のみ — 委任自動送信しない */
export const DELEGATED_PROPOSAL_SEND_MAX_COUNTER_ROUND = 2;

export function resolveProposalSendAuthority(
  caseRow: SchedulingCase
): SchedulingProposalSendAuthority | undefined {
  const authority = caseRow.proposal_send_authority;
  if (!authority) return undefined;
  if (!isHumanApproverOperatorId(authority.operator_id)) return undefined;
  try {
    assertApproverAuthorized(authority.approver_name, "A");
  } catch {
    return undefined;
  }
  return authority;
}

export function canDelegateProposalSend(caseRow: SchedulingCase): boolean {
  if (caseRow.counter_round > DELEGATED_PROPOSAL_SEND_MAX_COUNTER_ROUND) return false;
  if (caseRow.exception_reason === "schedule_counter_limit") return false;
  return Boolean(resolveProposalSendAuthority(caseRow));
}

export function clearProposalSendAuthority(caseId: string, revision: number): SchedulingCase {
  return updateSchedulingCase(caseId, revision, (row) => ({
    ...row,
    proposal_send_authority: undefined,
    updated_at: new Date().toISOString(),
  }));
}

export function invalidateStaleProposalSendAuthority(
  caseRow: SchedulingCase
): SchedulingCase {
  if (!caseRow.proposal_send_authority) return caseRow;
  if (resolveProposalSendAuthority(caseRow)) return caseRow;
  return clearProposalSendAuthority(caseRow.id, caseRow.revision);
}

export function assertDelegatableProposalSend(caseRow: SchedulingCase): SchedulingCase {
  let current = invalidateStaleProposalSendAuthority(caseRow);
  if (!canDelegateProposalSend(current)) return current;
  return current;
}

export function getDelegatableProposalSendAuthority(
  caseId: string
): SchedulingProposalSendAuthority | undefined {
  const current = findSchedulingCase(caseId);
  if (!current) return undefined;
  const validated = invalidateStaleProposalSendAuthority(current);
  if (!canDelegateProposalSend(validated)) return undefined;
  return resolveProposalSendAuthority(validated);
}
