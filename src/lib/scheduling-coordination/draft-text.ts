import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { loadExecutiveCalendar } from "../data.js";
import { loadSecretaryDraftTone } from "../secretary/tenant-behavior.js";
import { nextActionLabel } from "./next-action.js";

function formatSlotLines(caseRow: SchedulingCase): string {
  if (!caseRow.proposed_slots.length) return "（候補未設定）";
  return caseRow.proposed_slots
    .map((s, i) => `${i + 1}. ${s.label ?? `${s.start}–${s.end}`}`)
    .join("\n");
}

function formatParticipantStatus(caseRow: SchedulingCase): string {
  return caseRow.participants
    .map((p) => {
      const slot =
        p.accepted_slot_id &&
        caseRow.proposed_slots.find((s) => s.id === p.accepted_slot_id)?.label;
      return `- ${p.name}: ${p.response}${slot ? ` (${slot})` : ""}`;
    })
    .join("\n");
}

export type SchedulingDraftKind = "proposal" | "reminder" | "confirm";

export function buildSchedulingDraftText(
  caseRow: SchedulingCase,
  kind: SchedulingDraftKind,
  targetParticipant?: SchedulingParticipant
): { subject: string; body: string } {
  const slots = formatSlotLines(caseRow);
  const subjectBase = caseRow.title;
  const tone = loadSecretaryDraftTone();
  const greeting = targetParticipant?.name
    ? `${targetParticipant.name} 様`
    : "ご担当者様";
  const formatLabel =
    caseRow.meeting_format === "online"
      ? "オンライン"
      : caseRow.meeting_format === "in_person"
        ? "対面"
        : undefined;

  if (kind === "proposal") {
    return {
      subject: `【日程調整】${subjectBase}`,
      body: [
        greeting,
        "",
        `${subjectBase}につき、下記候補日時からご都合をお知らせください。`,
        "",
        slots,
        formatLabel ? `形式: ${formatLabel}` : "",
        caseRow.meeting_format === "in_person" && caseRow.location
          ? `場所: ${caseRow.location}`
          : "",
        "",
        tone.proposalClosing,
      ].filter(Boolean).join("\n"),
    };
  }

  if (kind === "reminder") {
    const pending = caseRow.participants
      .filter((p) => p.response === "pending")
      .map((p) => p.name)
      .join("、");
    return {
      subject: `Re: 【日程調整】${subjectBase}`,
      body: [
        greeting,
        "",
        `${subjectBase} の日程調整について、ご回答をお待ちしております。`,
        pending && !targetParticipant ? `（未回答: ${pending}）` : "",
        "",
        "候補日時:",
        slots,
        "",
        "ご都合をお知らせください。",
        "",
        tone.reminderClosing,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const slot =
    caseRow.proposed_slots.find((s) =>
      caseRow.participants.every(
        (p) => p.response !== "accept" || p.accepted_slot_id === s.id
      )
    ) ?? caseRow.proposed_slots[0];
  const calendarEvent = caseRow.linked_event_id
    ? loadExecutiveCalendar().events.find((event) => event.id === caseRow.linked_event_id)
    : undefined;
  const meetingLine =
    caseRow.meeting_format === "online"
      ? calendarEvent?.meet_url
        ? `参加URL: ${calendarEvent.meet_url}`
        : "形式: オンライン"
      : caseRow.location
        ? `場所: ${caseRow.location}`
        : formatLabel
          ? `形式: ${formatLabel}`
          : "";

  return {
    subject: `Re: 【日程確定】${subjectBase}`,
    body: [
      greeting,
      "",
      `${subjectBase}は、下記日時で確定いたしました。`,
      "",
      slot ? `日時: ${slot.label ?? `${slot.start}–${slot.end}`}` : slots,
      meetingLine,
      "",
      tone.confirmClosing,
    ].filter(Boolean).join("\n"),
  };
}

export function formatSchedulingCaseSummary(caseRow: SchedulingCase): string {
  return [
    `**${caseRow.id}** ${caseRow.title} · ${caseRow.status}`,
    `次: ${nextActionLabel(caseRow.next_action)}`,
    formatParticipantStatus(caseRow),
  ].join("\n");
}

export function draftKindForNextAction(
  caseRow: SchedulingCase
): SchedulingDraftKind | undefined {
  switch (caseRow.next_action) {
    case "send_proposal":
      return "proposal";
    case "send_reminder":
      return "reminder";
    case "send_confirmation":
      return "confirm";
    default:
      return undefined;
  }
}
