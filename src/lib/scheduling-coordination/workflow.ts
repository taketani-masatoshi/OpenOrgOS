import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { resolveMailConfig } from "../correspondence/mail-config.js";
import { ensureSchedulingCeoConfirmQuestion } from "./ceo-confirm.js";
import { ensureSchedulingCorrespondenceDrafts } from "./lifecycle.js";
import { applyNextAction } from "./next-action.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

function reminderDelayMs(): number {
  return resolveMailConfig().receive.scheduling_reminder_after_hours * 60 * 60 * 1000;
}

export function refreshSchedulingReminder(
  caseId: string,
  now = new Date()
): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  if (
    current.status !== "awaiting_responses" ||
    !current.participants.some((p) => p.response === "pending")
  ) {
    return current;
  }

  const dueAt =
    current.reminder_due_at ??
    new Date(new Date(current.updated_at).getTime() + reminderDelayMs()).toISOString();
  const alreadyDrafted = new Set(
    current.reminder_history
      .filter((r) => r.proposal_revision === current.proposal_revision)
      .map((r) => r.participant_id)
  );
  const targets =
    now.getTime() >= new Date(dueAt).getTime()
      ? current.participants
          .filter((p) => p.response === "pending" && p.email && !alreadyDrafted.has(p.id))
          .map((p) => p.id)
      : [];
  if (
    current.reminder_due_at === dueAt &&
    current.reminder_targets.length === targets.length &&
    current.reminder_targets.every((id, i) => id === targets[i])
  ) {
    return current;
  }
  return updateSchedulingCase(current.id, current.revision, (row) =>
    applyNextAction({
      ...row,
      reminder_due_at: dueAt,
      reminder_targets: targets,
      updated_at: now.toISOString(),
    })
  );
}

export function markSchedulingReminderDrafted(
  caseId: string,
  participantId: string,
  draftId?: string,
  now = new Date()
): SchedulingCase {
  const current = findSchedulingCase(caseId);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const duplicate = current.reminder_history.some(
    (r) =>
      r.proposal_revision === current.proposal_revision &&
      r.participant_id === participantId
  );
  if (duplicate) return current;
  return updateSchedulingCase(current.id, current.revision, (row) =>
    applyNextAction({
      ...row,
      reminder_history: [
        ...row.reminder_history,
        {
          proposal_revision: row.proposal_revision,
          participant_id: participantId,
          drafted_at: now.toISOString(),
          draft_id: draftId,
        },
      ],
      reminder_targets: row.reminder_targets.filter((id) => id !== participantId),
      updated_at: now.toISOString(),
    })
  );
}

/**
 * Persists the pure state-machine result first, then performs the required
 * side effect. This ordering keeps retries observable and removes side effects
 * from next-action.ts.
 */
export function advanceSchedulingWorkflow(caseId: string, now = new Date()): SchedulingCase {
  const current = refreshSchedulingReminder(caseId, now);
  if (!current) throw new Error(`Scheduling case ${caseId} not found`);
  const next = applyNextAction(current);
  const persisted =
    next.status === current.status && next.next_action === current.next_action
      ? current
      : updateSchedulingCase(current.id, current.revision, () => ({
          ...next,
          updated_at: new Date().toISOString(),
        }));

  if (persisted.next_action === "send_clarify") {
    // The venue question goes out before any date is offered, so nothing else
    // in the pipeline would draft it.
    ensureSchedulingCorrespondenceDrafts(persisted.id, "clarify");
    return findSchedulingCase(caseId) ?? persisted;
  }

  if (persisted.next_action !== "ceo_confirm") return persisted;
  ensureSchedulingCeoConfirmQuestion(persisted);
  return findSchedulingCase(caseId) ?? persisted;
}
