import type { OrgApprovalRequest } from "../../../../schemas/org/approval.js";
import type { OperatorAttestation } from "../../../../schemas/org/operator-attestation.js";
import type { OrgApprovalTier } from "../../../../schemas/org/tier.js";
import type { WireApprovalGateResult } from "../../../../schemas/protocol/wire-approval.js";
import type { SettlementWebAuthnAssertion } from "../../../../schemas/org/settlement-stepup.js";
import {
  assertWireGovernanceApproval,
  normalizePersonName,
} from "../../jurisdiction/wire-governance/index.js";
import {
  isCorrespondenceApprovalSubject,
} from "../../correspondence/review.js";
import {
  findOperatorByApproverName,
  findOperatorById,
} from "../operators.js";
import {
  findOrgApproval,
  loadOrgApprovalRegistry,
  saveOrgApprovalRegistry,
  withOrgApprovalRegistryLock,
} from "./registry.js";
import { emitOrgAuditAttested } from "../audit-emit.js";
import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
} from "../../../../schemas/finance/expense-claim.js";
import {
  assertExpenseClaimManagerApprover,
  assertExpenseClaimRepresentativeApprover,
} from "../../finance/expense-claim-approver.js";
import {
  assertSettlementAssuranceOrThrow,
  markSettlementChallengeConsumed,
} from "../settlement-stepup.js";

/** Subjects that forbid the proposer from also being the approver (ADR 0027). */
export function isSelfApprovalBannedSubject(subjectType: string): boolean {
  return (
    subjectType === "budget.company_total" ||
    subjectType === "budget.department_total" ||
    subjectType === "expense.claim.manager" ||
    subjectType === EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT ||
    subjectType === EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT ||
    subjectType === "expense.claim.ringi" ||
    subjectType === EXPENSE_CLAIM_BOARD_SUBJECT ||
    subjectType === "tenant.config" ||
    subjectType.startsWith("business_plan.")
  );
}

function operatorMatchesApproverIdentity(
  operatorId: string,
  approverId: string,
): boolean {
  if (operatorId === approverId) return true;
  const op = findOperatorById(operatorId);
  if (!op) return false;
  const norm = normalizePersonName(approverId);
  if (normalizePersonName(op.display_name) === norm) return true;
  if (op.approver_name && normalizePersonName(op.approver_name) === norm) {
    return true;
  }
  return false;
}

/**
 * True when the named approver (and optional operator_id) is the same person
 * as approval.proposed_by.
 */
export function isSelfApproval(
  approval: OrgApprovalRequest,
  approverId: string,
  operatorId?: string,
): boolean {
  const proposed = approval.proposed_by?.trim();
  if (!proposed) return false;

  if (operatorId?.trim() && operatorId.trim() === proposed) return true;
  if (approverId.trim() === proposed) return true;

  if (operatorMatchesApproverIdentity(proposed, approverId)) return true;

  const byName = findOperatorByApproverName(approverId);
  if (byName?.operator_id === proposed) return true;

  if (operatorId?.trim()) {
    if (operatorMatchesApproverIdentity(operatorId.trim(), proposed)) {
      return true;
    }
  }
  return false;
}

export function assertNotSelfApproval(
  approval: OrgApprovalRequest,
  approverId: string,
  operatorId?: string,
): void {
  if (!isSelfApprovalBannedSubject(approval.subject_type)) return;
  if (!isSelfApproval(approval, approverId, operatorId)) return;
  throw new Error(
    `自己承認は禁止されています（${approval.subject_type} · proposed_by=${approval.proposed_by}）。` +
      `別の承認者が承認してください。`,
  );
}

export interface ApproveOrgApprovalOptions {
  approvalId: string;
  approverId: string;
  coApproverId?: string;
  operatorId?: string;
  basis?: OperatorAttestation["basis"];
  basisRef?: string;
  /** When false, caller emits audit after side effects (wire transmit). */
  emitAudit?: boolean;
  /** correspondence.* — must be true when human confirmed draft review */
  humanReviewConfirmed?: boolean;
  /** ADR 0037 — required for REG-004 tier B/C */
  settlementAssertion?: SettlementWebAuthnAssertion & {
    challenge_id: string;
    token: string;
  };
}

export interface ApproveOrgApprovalResult {
  approval: OrgApprovalRequest;
  gate: WireApprovalGateResult;
  attestation: OperatorAttestation;
  auditEnvelope?: ReturnType<typeof emitOrgAuditAttested>;
}

function resolveAmount(approval: OrgApprovalRequest): { value: number; currency: string } {
  if (approval.amount) return approval.amount;
  return { value: 0, currency: "JPY" };
}

function defaultBasis(approval: OrgApprovalRequest): OperatorAttestation["basis"] {
  if (approval.scope === "internal") return "internal_policy";
  if (approval.wire?.transaction_type === "contract.executed") {
    return "new_contract_instrument";
  }
  return "existing_contract";
}

export function evaluateOrgApprovalGate(
  approval: OrgApprovalRequest,
  approverId: string,
  coApproverId?: string,
  operatorId?: string,
): WireApprovalGateResult {
  if (approval.subject_type === EXPENSE_CLAIM_MANAGER_SUBJECT) {
    return assertExpenseClaimManagerApprover({
      claimId: approval.subject_ref ?? "",
      approverId,
      operatorId,
    });
  }
  if (approval.subject_type === EXPENSE_CLAIM_RINGI_SUBJECT) {
    return assertExpenseClaimRepresentativeApprover({
      approverId,
      coApproverId,
      policyRef: "expense.claim.ringi",
      requireDual: true,
    });
  }
  if (
    approval.subject_type === EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT ||
    approval.subject_type === EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT ||
    approval.subject_type === EXPENSE_CLAIM_BOARD_SUBJECT
  ) {
    return assertExpenseClaimRepresentativeApprover({
      approverId,
      policyRef: approval.subject_type,
    });
  }
  const amount = resolveAmount(approval);
  return assertWireGovernanceApproval({
    amount: amount.value,
    currency: amount.currency,
    approverId,
    coApproverId,
    policyRef: approval.approval_policy_ref,
  });
}

export function approveOrgApproval(opts: ApproveOrgApprovalOptions): ApproveOrgApprovalResult {
  return withOrgApprovalRegistryLock(() => {
    const registry = loadOrgApprovalRegistry();
    const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
    if (idx < 0) {
      throw new Error(`Approval ${opts.approvalId} not found`);
    }
    const approval = registry.approvals[idx]!;
    if (approval.status !== "pending_approval") {
      throw new Error(
        `Approval ${opts.approvalId} status is ${approval.status}, expected pending_approval`
      );
    }

    if (isCorrespondenceApprovalSubject(approval.subject_type) && !opts.humanReviewConfirmed) {
      throw new Error(
        `Correspondence approval ${opts.approvalId} requires humanReviewConfirmed after draft review — ` +
          `use: org approval approve --id ${opts.approvalId} --approver "<CEO>" --reviewed`
      );
    }

    assertNotSelfApproval(approval, opts.approverId, opts.operatorId);

    const settlementMeta = assertSettlementAssuranceOrThrow(
      approval,
      opts.settlementAssertion
    );

    const gate = evaluateOrgApprovalGate(
      approval,
      opts.approverId,
      opts.coApproverId,
      opts.operatorId,
    );
    const approvedAt = new Date().toISOString();
    const attestation: OperatorAttestation = {
      operator_id: opts.operatorId ?? approval.proposed_by,
      approver_id: opts.approverId,
      co_approver_id: opts.coApproverId,
      approval_tier: gate.tier as OrgApprovalTier,
      approved_at: approvedAt,
      basis: opts.basis ?? defaultBasis(approval),
      basis_ref: opts.basisRef ?? approval.subject_ref ?? approval.wire?.contract_id,
      approval_id: approval.approval_id,
      notice_id: approval.scope === "wire" ? approval.approval_id : undefined,
      approval_policy_ref: gate.policyRef,
      ...(settlementMeta
        ? {
            settlement_credential_id: settlementMeta.settlement_credential_id,
            settlement_challenge_id: settlementMeta.settlement_challenge_id,
            settlement_rp_id: settlementMeta.settlement_rp_id,
          }
        : {}),
    };

    const emitAudit = opts.emitAudit ?? approval.scope === "internal";
    let auditEnvelope: ReturnType<typeof emitOrgAuditAttested> | undefined;
    if (emitAudit) {
      auditEnvelope = emitOrgAuditAttested({
        approval,
        attestation,
        kind: "approval.granted",
      });
    }

    registry.approvals[idx] = {
      ...approval,
      status: approval.scope === "internal" ? "approved" : approval.status,
      approver_id: opts.approverId,
      co_approver_id: opts.coApproverId,
      approval_tier: gate.tier,
      approved_at: approvedAt,
      audit_event_id: auditEnvelope?.event_id,
      ...(isCorrespondenceApprovalSubject(approval.subject_type) && opts.humanReviewConfirmed
        ? {
            human_review_confirmed_at: approvedAt,
            approved_by_operator_id: opts.operatorId,
          }
        : {}),
    };
    saveOrgApprovalRegistry(registry);

    if (settlementMeta) {
      markSettlementChallengeConsumed(settlementMeta.settlement_challenge_id);
    }

    return {
      approval: registry.approvals[idx]!,
      gate,
      attestation,
      auditEnvelope,
    };
  });
}

export function completeOrgApprovalWire(opts: {
  approvalId: string;
  transactionId: string;
  wireEventId: string;
  attestation: OperatorAttestation;
}): { approval: OrgApprovalRequest; auditEnvelope: ReturnType<typeof emitOrgAuditAttested> } {
  const registry = loadOrgApprovalRegistry();
  const idx = registry.approvals.findIndex((a) => a.approval_id === opts.approvalId);
  if (idx < 0) {
    throw new Error(`Approval ${opts.approvalId} not found`);
  }
  const approval = registry.approvals[idx]!;
  if (!approval.wire) {
    throw new Error(`Approval ${opts.approvalId} has no wire details`);
  }

  const auditEnvelope = emitOrgAuditAttested({
    approval,
    attestation: opts.attestation,
    kind: "approval.granted",
    transactionId: opts.transactionId,
    wireEventId: opts.wireEventId,
  });

  registry.approvals[idx] = {
    ...approval,
    status: "completed",
    audit_event_id: auditEnvelope.event_id,
    wire: {
      ...approval.wire,
      transaction_id: opts.transactionId,
      wire_event_id: opts.wireEventId,
    },
  };
  saveOrgApprovalRegistry(registry);
  return { approval: registry.approvals[idx]!, auditEnvelope };
}

export { findOrgApproval };
