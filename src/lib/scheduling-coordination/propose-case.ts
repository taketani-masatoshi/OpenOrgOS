import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { currentDate } from "../utils.js";
import { resolveNextAction } from "./judgment-context.js";
import type { SlotTimePreference } from "./slots.js";
import { proposeExecutiveSlotsFromWorkspace } from "./slots-workspace.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";
import { schedulingCaseLooksLikeMeal } from "./meal-cost.js";
import { ensureSchedulingCorrespondenceDrafts } from "./correspondence-drafts.js";
import { SchedulingCaseNotFoundError } from "./errors.js";

/**
 * Generate calendar slots onto a scheduling case after venue clarify is sent.
 */
export function proposeSlotsOntoSchedulingCase(
  caseId: string,
  opts?: {
    from?: string;
    to?: string;
    count?: number;
    timePreference?: SlotTimePreference;
    /** Drop unsent proposal drafts and recreate after slot rewrite (default: true if slots already exist) */
    refreshDrafts?: boolean;
  }
): SchedulingCase {
  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new SchedulingCaseNotFoundError(caseId);
  if (!caseRow.ceo_intake_confirmed || caseRow.exception_reason === "schedule_intake_pending") {
    throw new Error(
      `Cannot propose ${caseId}: CEO intake pending (purpose / meeting format)`
    );
  }

  const timePreference: SlotTimePreference =
    opts?.timePreference ??
    (schedulingCaseLooksLikeMeal(caseRow) ? "evening" : "business_hours");

  const refreshDrafts = opts?.refreshDrafts ?? caseRow.proposed_slots.length > 0;

  const slots = proposeExecutiveSlotsFromWorkspace({
    from: opts?.from ?? caseRow.search_from ?? currentDate(),
    to: opts?.to ?? caseRow.search_to,
    count: opts?.count ?? 3,
    durationMinutes: caseRow.duration_minutes,
    existingSlots: [],
    timePreference,
  });

  let updated = updateSchedulingCase(caseRow.id, caseRow.revision, () =>
    resolveNextAction({
      ...caseRow,
      proposed_slots: slots,
      correspondence: refreshDrafts
        ? caseRow.correspondence.filter(
            (record) =>
              !(
                record.kind === "proposal" &&
                !record.sent_at &&
                record.proposal_revision === caseRow.proposal_revision
              )
          )
        : caseRow.correspondence,
      status: slots.length ? "proposing" : caseRow.status,
      updated_at: new Date().toISOString(),
    })
  );

  if (
    slots.length &&
    (refreshDrafts || !updated.correspondence.some((record) => record.kind === "proposal"))
  ) {
    updated = ensureSchedulingCorrespondenceDrafts(updated.id, "proposal");
  }
  return updated;
}
