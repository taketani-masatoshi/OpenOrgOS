import type { DraftTextParts } from "./draft-text-parts.js";
import { joinSchedulingDraftLines, sanitizeSchedulingDraftBody } from "./draft-text-lines.js";

export function buildSchedulingReminderText(p: DraftTextParts): { subject: string; body: string } {
  const {
    caseRow,
    targetParticipant,
    subjectBase,
    tone,
    style,
    en,
    slots,
    greeting,
    opener,
    selfIntro,
    signature,
  } = p;
  const pending = caseRow.participants
    .filter((participant) => participant.response === "pending")
    .map((participant) => participant.name)
    .join(en ? ", " : "、");
  const closing =
    tone.reminderClosing ||
    style.closings?.request?.trim() ||
    (en ? "Thank you," : "何卒よろしくお願い申し上げます。");
  return {
    subject: en ? `Re: [Scheduling] ${subjectBase}` : `Re: 【日程調整】${subjectBase}`,
    body: sanitizeSchedulingDraftBody(
      joinSchedulingDraftLines([
        greeting,
        "",
        opener || undefined,
        selfIntro,
        "",
        en
          ? `We are following up on scheduling for ${subjectBase}.`
          : `${subjectBase} の日程調整について、ご回答をお待ちしております。`,
        pending && !targetParticipant
          ? en
            ? `(Awaiting: ${pending})`
            : `（未回答: ${pending}）`
          : undefined,
        "",
        en ? "Proposed times:" : "候補日時:",
        slots,
        "",
        en ? "Please let us know your availability." : "ご都合をお知らせください。",
        "",
        closing,
        "",
        signature,
      ])
    ),
  };
}
