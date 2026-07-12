import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { orgApprovalRequestSchema } from "../../../schemas/org/approval.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import {
  findOrgApproval,
  loadOrgApprovalRegistry,
  saveOrgApprovalRegistry,
} from "../org/approval/index.js";
import { listCorrespondenceDrafts } from "./draft.js";
import { isCorrespondenceApprovalSubject } from "./review.js";

/** Rebuild a missing registry row from an existing correspondence draft. */
export function buildApprovalFromDraft(draft: CorrespondenceDraft): OrgApprovalRequest {
  if (!draft.approval_id) {
    throw new Error(`Draft ${draft.draft_id} has no approval_id`);
  }
  if (
    !isCorrespondenceApprovalSubject(
      draft.channel === "email" ? "correspondence.email" : "correspondence.slack"
    )
  ) {
    throw new Error(
      `Draft ${draft.draft_id} channel ${draft.channel} is not correspondence approval`
    );
  }
  const subjectType = draft.channel === "email" ? "correspondence.email" : "correspondence.slack";
  const status =
    draft.status === "approved" || draft.status === "sent"
      ? "approved"
      : draft.status === "rejected"
        ? "rejected"
        : "pending_approval";

  return orgApprovalRequestSchema.parse({
    approval_id: draft.approval_id,
    scope: "internal",
    status,
    proposed_at: draft.created_at,
    proposed_by: draft.created_by,
    subject_type: subjectType,
    subject_ref: draft.draft_id,
    message: draft.subject ?? draft.body.slice(0, 120),
    approval_policy_ref: "REG-004",
    ...(status === "approved"
      ? {
          approver_id: draft.created_by,
          approved_at: draft.created_at,
          human_review_confirmed_at: draft.created_at,
        }
      : {}),
  });
}

/** Ensure pending-approvals.yaml contains the draft's approval_id (idempotent). */
export function repairMissingApprovalForDraft(
  draft: CorrespondenceDraft
): OrgApprovalRequest | undefined {
  if (!draft.approval_id) return undefined;
  const existing = findOrgApproval(draft.approval_id);
  if (existing) return existing;

  const approval = buildApprovalFromDraft(draft);
  const registry = loadOrgApprovalRegistry();
  registry.approvals.push(approval);
  saveOrgApprovalRegistry(registry);
  return approval;
}

/** Scan correspondence drafts and repair orphan approval_id references. */
export function repairCorrespondenceApprovalRegistry(): { repaired: string[] } {
  const repaired: string[] = [];
  for (const draft of listCorrespondenceDrafts()) {
    if (!draft.approval_id || findOrgApproval(draft.approval_id)) continue;
    repairMissingApprovalForDraft(draft);
    repaired.push(draft.draft_id);
  }
  return { repaired };
}
