import type {
  SchedulingCase,
  SchedulingCaseInput,
  SchedulingNextAction,
} from "../../../schemas/executive/scheduling-cases.js";
import { schedulingCaseSchema } from "../../../schemas/executive/scheduling-cases.js";
import {
  caseNeedsCeoIntake,
  isCeoGateException,
  SCHEDULE_COUNTER_NEEDS_CEO,
  SCHEDULE_FORMAT_CHANGE,
  SCHEDULE_IDENTITY_QUERY,
  SCHEDULE_INTAKE_PENDING,
  SCHEDULE_PURPOSE_UNCLEAR,
  SCHEDULE_VENUE_PENDING,
  SCHEDULE_VENUE_CLARIFY,
  SCHEDULE_VENUE_RESERVATION_PENDING,
} from "./ceo-gates.js";
import { caseNeedsVenueResolution, caseNeedsVenueReservationForConfirm } from "./venue-gate.js";
import {
  clarifySentForRevision,
  needsClarifyBeforeProposal,
  needsVenueClarifyInput,
} from "./venue-clarify.js";
import { findUnanimousAcceptedSlot } from "./slots.js";

export function computeNextAction(caseRow: SchedulingCase): SchedulingNextAction {
  if (
    caseRow.status === "closed" ||
    caseRow.status === "cancelled" ||
    caseRow.status === "needs_review"
  ) {
    return "none";
  }

  if (caseNeedsVenueResolution(caseRow)) {
    return "ceo_confirm";
  }

  if (needsVenueClarifyInput(caseRow)) {
    return "ceo_confirm";
  }

  if (caseRow.status === "confirmed") {
    if (caseNeedsVenueReservationForConfirm(caseRow)) {
      return "none";
    }
    return caseRow.calendar_sync === "synced" ? "send_confirmation" : "write_calendar";
  }

  if (caseRow.status === "notifying") {
    if (caseNeedsVenueReservationForConfirm(caseRow)) {
      return "none";
    }
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

  if (caseNeedsCeoIntake(caseRow) || caseRow.exception_reason === SCHEDULE_INTAKE_PENDING) {
    return "ceo_confirm";
  }

  if (
    isCeoGateException(caseRow.exception_reason) &&
    [
      SCHEDULE_COUNTER_NEEDS_CEO,
      SCHEDULE_FORMAT_CHANGE,
      SCHEDULE_PURPOSE_UNCLEAR,
      SCHEDULE_IDENTITY_QUERY,
      SCHEDULE_VENUE_PENDING,
      SCHEDULE_VENUE_CLARIFY,
      "schedule_counter_limit",
    ].includes(caseRow.exception_reason ?? "")
  ) {
    // 会場ゲート理由が残っていても、条件が解消済みなら通過（applyNextAction で clear）
    if (
      caseRow.exception_reason === SCHEDULE_VENUE_CLARIFY &&
      !needsVenueClarifyInput(caseRow)
    ) {
      /* fall through */
    } else if (
      caseRow.exception_reason === SCHEDULE_VENUE_PENDING &&
      !caseNeedsVenueResolution(caseRow)
    ) {
      /* fall through */
    } else {
      return "ceo_confirm";
    }
  }

  const hasCounter = caseRow.participants.some((p) => p.response === "counter");
  if (hasCounter) {
    return "ceo_confirm";
  }

  const unanimous = findUnanimousAcceptedSlot(caseRow.participants, caseRow.proposed_slots);
  if (unanimous) {
    return "ceo_confirm";
  }

  if (needsClarifyBeforeProposal(caseRow)) {
    const drafted = caseRow.correspondence.some(
      (r) => r.kind === "clarify" && r.proposal_revision === caseRow.proposal_revision
    );
    return drafted && !clarifySentForRevision(caseRow) ? "none" : "send_clarify";
  }

  if (!caseRow.proposed_slots.length) {
    if (caseRow.meeting_format === "in_person" && !clarifySentForRevision(caseRow)) {
      return "none";
    }
    return "propose_slots";
  }

  if (caseRow.status === "open" || caseRow.status === "proposing") {
    if (caseRow.meeting_format === "in_person" && !clarifySentForRevision(caseRow)) {
      return "send_clarify";
    }
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
  let exception_reason = caseRow.exception_reason;

  if (caseNeedsCeoIntake(caseRow) && !exception_reason) {
    exception_reason = SCHEDULE_INTAKE_PENDING;
  }

  if (needsVenueClarifyInput(caseRow) && !exception_reason) {
    exception_reason = SCHEDULE_VENUE_CLARIFY;
  }

  if (caseNeedsVenueResolution(caseRow)) {
    exception_reason = SCHEDULE_VENUE_PENDING;
  } else if (
    exception_reason === SCHEDULE_VENUE_PENDING &&
    !caseNeedsVenueResolution(caseRow)
  ) {
    exception_reason = undefined;
  } else if (
    exception_reason === SCHEDULE_VENUE_CLARIFY &&
    !needsVenueClarifyInput(caseRow)
  ) {
    exception_reason = undefined;
  }

  if (caseNeedsVenueReservationForConfirm(caseRow)) {
    exception_reason = SCHEDULE_VENUE_RESERVATION_PENDING;
  } else if (
    exception_reason === SCHEDULE_VENUE_RESERVATION_PENDING &&
    !caseNeedsVenueReservationForConfirm(caseRow)
  ) {
    exception_reason = undefined;
  }

  if (next_action === "send_clarify" && status === "open") {
    status = "proposing";
  }
  if (next_action === "send_proposal" && status === "open") {
    status = "proposing";
  }
  if (next_action === "send_reminder" && status === "proposing") {
    status = "awaiting_responses";
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
  if (hasCounterResponses(caseRow) && caseRow.counter_round >= 3) {
    exception_reason = "schedule_counter_limit";
  } else if (
    caseRow.proposed_slots.length > 0 &&
    caseRow.participants.every((p) => p.response === "accept") &&
    (acceptedSlotIds.size !== 1 || hasAcceptWithoutSlot)
  ) {
    exception_reason = "schedule_split_accept";
  }

  return { ...caseRow, status, next_action, exception_reason };
}

function hasCounterResponses(caseRow: SchedulingCase): boolean {
  return caseRow.participants.some((p) => p.response === "counter");
}

export function nextActionLabel(action: SchedulingNextAction): string {
  switch (action) {
    case "propose_slots":
      return "候補日時を生成";
    case "send_clarify":
      return "会場案のご相談メール下書き";
    case "send_proposal":
      return "候補提示メール下書き";
    case "send_reminder":
      return "未回答者へのリマインド下書き";
    case "send_confirmation":
      return "確定通知メール下書き";
    case "ceo_confirm":
      return "CEO 確認";
    case "write_calendar":
      return "カレンダー反映";
    default:
      return "—";
  }
}
