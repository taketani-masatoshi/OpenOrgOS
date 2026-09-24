import { loadExecutiveCalendar } from "../data.js";
import { findVenueReservation } from "../venue-booking/store.js";
import { formatJapaneseSlotLabel } from "./draft-text-format.js";
import type { DraftTextParts } from "./draft-text-parts.js";
import { joinSchedulingDraftLines, sanitizeSchedulingDraftBody } from "./draft-text-lines.js";

export function buildSchedulingConfirmText(p: DraftTextParts): { subject: string; body: string } {
  const {
    caseRow,
    subjectBase,
    tone,
    style,
    en,
    slots,
    greeting,
    opener,
    selfIntro,
    signature,
    formatLabel,
    cost,
    access,
  } = p;
  const slot =
    caseRow.proposed_slots.find((candidate) =>
      caseRow.participants.every(
        (participant) =>
          participant.response !== "accept" || participant.accepted_slot_id === candidate.id
      )
    ) ?? caseRow.proposed_slots[0];
  const calendarEvent = caseRow.linked_event_id
    ? loadExecutiveCalendar().events.find((event) => event.id === caseRow.linked_event_id)
    : undefined;
  const datetimeLabel = slot
    ? en
      ? (slot.label ?? `${slot.start}–${slot.end}`)
      : formatJapaneseSlotLabel(slot.start, slot.end)
    : slots;
  const thanks =
    style.opener?.reply_thanks?.trim() ||
    (en ? "Thank you for your reply." : "ご返信ありがとうございました。");
  // 正本 style.yaml の結びを優先（テナント短縮形より品格を優先）
  const closing =
    style.closings?.confirm?.trim() ||
    tone.confirmClosing ||
    (en ? "We look forward to meeting you." : "当日は何卒よろしくお願い申し上げます。");
  const meetingLines: string[] = [];
  if (caseRow.meeting_format === "online") {
    if (calendarEvent?.meet_url) {
      meetingLines.push(
        en ? `Join URL: ${calendarEvent.meet_url}` : `参加URL: ${calendarEvent.meet_url}`
      );
    } else {
      meetingLines.push(en ? "Format: Online" : "形式: オンライン");
    }
  } else if (caseRow.location) {
    meetingLines.push(en ? `Venue: ${caseRow.location}` : `・会場: ${caseRow.location}`);
    if (access) meetingLines.push(en ? `Access: ${access}` : `・アクセス: ${access}`);
    if (cost) {
      meetingLines.push(en ? `Cost: ${cost}` : `・費用: ${cost}`);
    }
    if (caseRow.venue_reservation_id) {
      const vr = findVenueReservation(caseRow.venue_reservation_id);
      if (vr?.external_ref && vr.status === "confirmed") {
        meetingLines.push(
          en ? `Reservation ref: ${vr.external_ref}` : `・ご予約番号: ${vr.external_ref}`
        );
      }
    }
  } else if (formatLabel) {
    meetingLines.push(en ? `Format: ${formatLabel}` : `形式: ${formatLabel}`);
  }

  return {
    subject: en ? `Re: [Confirmed] ${subjectBase}` : `Re: 【日程確定】${subjectBase}`,
    body: sanitizeSchedulingDraftBody(
      joinSchedulingDraftLines([
        greeting,
        "",
        opener || undefined,
        selfIntro,
        "",
        thanks,
        en
          ? `We have confirmed the following for ${subjectBase}.`
          : "ご希望どおり、下記にて確定いたしました。",
        "",
        en ? `Date/Time: ${datetimeLabel}` : `・日時: ${datetimeLabel}`,
        ...meetingLines,
        "",
        closing,
        "",
        signature,
      ])
    ),
  };
}
