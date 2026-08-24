import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
  type ExpenseClaim,
  type ExpenseClaimGate,
} from "../../../schemas/finance/expense-claim.js";
import { orgApprovalRequestSchema } from "../../../schemas/org/approval.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import {
  findOrgApproval,
  loadOrgApprovalRegistry,
  nextApprovalId,
  saveOrgApprovalRegistry,
  withOrgApprovalRegistryLock,
} from "../org/approval/index.js";

const EXPENSE_CLAIM_SUBJECTS = new Set<string>([
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_RINGI_SUBJECT,
  EXPENSE_CLAIM_BOARD_SUBJECT,
]);

export function isExpenseClaimApprovalSubject(subjectType: string): boolean {
  return EXPENSE_CLAIM_SUBJECTS.has(subjectType);
}

function subjectTypeForGate(gate: ExpenseClaimGate | undefined): string {
  switch (gate) {
    case "needs_rep_approval":
      return EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT;
    case "needs_late_exception":
      return EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT;
    case "needs_ringi":
      return EXPENSE_CLAIM_RINGI_SUBJECT;
    case "needs_board":
      return EXPENSE_CLAIM_BOARD_SUBJECT;
    case "needs_manager":
    default:
      return EXPENSE_CLAIM_MANAGER_SUBJECT;
  }
}

function statusForClaim(claim: ExpenseClaim): OrgApprovalRequest["status"] {
  if (claim.status === "rejected") return "rejected";
  if (
    claim.status === "approved" ||
    claim.status === "posted" ||
    claim.status === "pending_reimbursement" ||
    claim.status === "reimbursed"
  ) {
    return "approved";
  }
  return "pending_approval";
}

export function buildApprovalFromExpenseClaim(
  claim: ExpenseClaim,
  approvalId: string,
): OrgApprovalRequest {
  const status = statusForClaim(claim);
  return orgApprovalRequestSchema.parse({
    approval_id: approvalId,
    scope: "internal",
    status,
    proposed_at: claim.proposed_at,
    proposed_by: claim.proposed_by,
    subject_type: subjectTypeForGate(claim.gate),
    subject_ref: claim.claim_id,
    amount: { value: claim.amount_yen, currency: claim.currency ?? "JPY" },
    message: `${claim.gate ?? "needs_manager"} · ${claim.claim_id} · ${claim.account_code} · ¥${claim.amount_yen}`,
    approval_policy_ref:
      claim.gate === "needs_manager" ? undefined : "REG-004",
    ...(status === "approved"
      ? {
          approver_id: claim.approved_by ?? claim.proposed_by,
          co_approver_id: claim.co_approved_by,
          approved_at: claim.approved_at ?? claim.proposed_at,
        }
      : {}),
    ...(status === "rejected"
      ? {
          approver_id: claim.rejected_by ?? claim.proposed_by,
          rejected_at: claim.rejected_at ?? claim.proposed_at,
          reject_reason: claim.reject_reason,
        }
      : {}),
  });
}

/**
 * Ensure `pending-approvals.yaml` has a row for the claim's approval_id.
 * Recreates orphans (e.g. after vitest restores `tenants/mal/data/org`).
 * If the stored id collides with another expense-claim subject, allocates a
 * fresh id and returns the updated claim (caller must persist).
 */
export function repairMissingApprovalForExpenseClaim(
  claim: ExpenseClaim,
): { claim: ExpenseClaim; repaired: boolean; approval: OrgApprovalRequest } {
  return withOrgApprovalRegistryLock(() => {
    let approvalId = claim.approval_id?.trim();
    if (!approvalId) {
      approvalId = nextApprovalId();
      const approval = buildApprovalFromExpenseClaim(claim, approvalId);
      const registry = loadOrgApprovalRegistry();
      registry.approvals.push(approval);
      saveOrgApprovalRegistry(registry);
      return {
        claim: { ...claim, approval_id: approvalId },
        repaired: true,
        approval,
      };
    }

    const existing = findOrgApproval(approvalId);
    if (existing) {
      if (
        existing.subject_ref &&
        existing.subject_ref !== claim.claim_id &&
        isExpenseClaimApprovalSubject(existing.subject_type)
      ) {
        const freshId = nextApprovalId();
        const approval = buildApprovalFromExpenseClaim(claim, freshId);
        const registry = loadOrgApprovalRegistry();
        registry.approvals.push(approval);
        saveOrgApprovalRegistry(registry);
        return {
          claim: { ...claim, approval_id: freshId },
          repaired: true,
          approval,
        };
      }
      return { claim, repaired: false, approval: existing };
    }

    const approval = buildApprovalFromExpenseClaim(claim, approvalId);
    const registry = loadOrgApprovalRegistry();
    registry.approvals.push(approval);
    saveOrgApprovalRegistry(registry);
    return { claim, repaired: true, approval };
  });
}
