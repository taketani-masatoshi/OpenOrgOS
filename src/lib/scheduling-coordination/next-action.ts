import type {
  SchedulingCase,
  SchedulingCaseInput,
  SchedulingNextAction,
} from "../../../schemas/executive/scheduling-cases.js";
import { schedulingCaseSchema } from "../../../schemas/executive/scheduling-cases.js";
import { findUnanimousAcceptedSlot } from "./slots.js";

export function computeNextAction(caseRow: SchedulingCase): SchedulingNextAction {
  if (
    caseRow.status === "closed" ||
    caseRow.status === "cancelled" ||
    caseRow.status === "needs_review"
  ) {
    return "none";
  }

  if (caseRow.status === "confirmed") {
    return caseRow.calendar_sync === "synced" ? "send_confirmation" : "write_calendar";
  }

  if (caseRow.status === "notifying") {
    const externalIds = caseRow.participants
      .filter((participant) => participant.role === "external")
      .map((participant) => participant.id);
    const allSent = externalIds.every((participantId) =>
      caseRow.correspondence.some(
        (record) =>
          record.kind === "confirm" &&
          record.participant_id === participantId &&
          record.proposal_revision === caseRow.proposal_revision &&
          record.sent_at
      )
    );
    return allSent ? "none" : "send_confirmation";
  }

  const hasCounter = caseRow.participants.some((p) => p.response === "counter");
  if (hasCounter && caseRow.counter_round >= 3) {
    return "ceo_confirm";
  }
  if (hasCounter) {
    return "propose_slots";
  }

  const unanimous = findUnanimousAcceptedSlot(caseRow.participants, caseRow.proposed_slots);
  if (unanimous) {
    return "ceo_confirm";
  }

  if (!caseRow.proposed_slots.length) {
    return "propose_slots";
  }

  if (caseRow.status === "open" || caseRow.status === "proposing") {
    return "send_proposal";
  }

  const pending = caseRow.participants.filter((p) => p.response === "pending").length;
  if (pending > 0) {
    if (caseRow.reminder_targets.length > 0) return "send_reminder";
    return "none";
  }

  const accepted = caseRow.participants.filter((p) => p.response === "accept");
  if (accepted.length === caseRow.participants.length && accepted.length > 0) {
    return "ceo_confirm";
  }

  return "propose_slots";
}

export function applyNextAction(caseInput: SchedulingCaseInput): SchedulingCase {
  const caseRow = schedulingCaseSchema.parse(caseInput);
  const next_action = computeNextAction(caseRow);
  let status = caseRow.status;

  if (next_action === "ceo_confirm" && status === "awaiting_responses") {
    status = "awaiting_responses";
  }
  if (next_action === "send_proposal" && status === "open") {
    status = "proposing";
  }
  if (next_action === "send_reminder" && status === "proposing") {
    status = "awaiting_responses";
  }
  if (next_action === "propose_slots" && hasCounterResponses(caseRow)) {
    status = "proposing";
  }

  if (next_action === "ceo_confirm") {
    status = "awaiting_ceo";
  }

  const acceptedSlotIds = new Set(
    caseRow.participants
      .filter((p) => p.response === "accept")
      .map((p) => p.accepted_slot_id)
      .filter(Boolean)
  );
  const hasAcceptWithoutSlot = caseRow.participants.some(
    (p) => p.response === "accept" && !p.accepted_slot_id
  );
  const exception_reason =
    hasCounterResponses(caseRow) && caseRow.counter_round >= 3
      ? "schedule_counter_limit"
      : caseRow.proposed_slots.length > 0 &&
          caseRow.participants.every((p) => p.response === "accept") &&
          (acceptedSlotIds.size !== 1 || hasAcceptWithoutSlot)
        ? "schedule_split_accept"
        : caseRow.exception_reason;

  return { ...caseRow, status, next_action, exception_reason };
}

function hasCounterResponses(caseRow: SchedulingCase): boolean {
  return caseRow.participants.some((p) => p.response === "counter");
}

export function nextActionLabel(action: SchedulingNextAction): string {
  switch (action) {
    case "propose_slots":
      return "候補日時を生成";
    case "send_proposal":
      return "候補提示メール下書き";
    case "send_reminder":
      return "未回答者へのリマインド下書き";
    case "send_confirmation":
      return "確定通知メール下書き";
    case "ceo_confirm":
      return "CEO 最終確認";
    case "write_calendar":
      return "カレンダー反映";
    default:
      return "—";
  }
}
