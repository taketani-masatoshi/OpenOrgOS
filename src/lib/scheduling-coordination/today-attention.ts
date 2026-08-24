import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { SCHEDULE_VENUE_RESERVATION_PENDING } from "./ceo-gates.js";
import { findPendingApprovalForCase } from "./ceo-confirm.js";
import { listCorrespondenceDrafts } from "../correspondence/draft.js";

/** Unsent correspondence for current proposal revision */
export function hasUnsentSchedulingDraft(caseRow: SchedulingCase): boolean {
  return caseRow.correspondence.some(
    (record) =>
      record.proposal_revision === caseRow.proposal_revision &&
      !record.sent_at &&
      (record.kind === "clarify" ||
        record.kind === "proposal" ||
        record.kind === "reminder" ||
        record.kind === "confirm")
  );
}

/**
 * Cases that should appear on CEO Today / ops-poll even when next_action is none
 * (draft awaiting approval, VR reservation pending).
 */
export function schedulingCaseNeedsTodayAttention(caseRow: SchedulingCase): boolean {
  if (caseRow.status === "cancelled" || caseRow.status === "closed") return false;
  if (caseRow.next_action !== "none") return true;
  if (caseRow.exception_reason === SCHEDULE_VENUE_RESERVATION_PENDING) return true;
  if (hasUnsentSchedulingDraft(caseRow)) return true;
  if (findPendingApprovalForCase(caseRow.id)) return true;
  // Pending approval drafts may exist before correspondence record is linked
  const prefix = `scheduling-case:${caseRow.id}`;
  return listCorrespondenceDrafts({ status: "pending_approval", channel: "email" }).some((d) =>
    d.notes?.includes(prefix)
  );
}
