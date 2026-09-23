import type { SchedulingCase, SchedulingParticipant } from "../../../schemas/executive/scheduling-cases.js";
import type { CorrespondenceStyle } from "../correspondence/style-resolve.js";
import type { DraftTextParts } from "./draft-text-parts.js";
import { joinSchedulingDraftLines, sanitizeSchedulingDraftBody } from "./draft-text-lines.js";

export type { DraftTextParts };

export function buildSchedulingProposalText(p: DraftTextParts): { subject: string; body: string } {
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
    purposeLine,
    cost,
    access,
  } = p;
  const closing =
    tone.proposalClosing ||
    style.closings?.request?.trim() ||
    (en ? "Thank you," : "何卒よろしくお願い申し上げます。");
  return {
    subject: en ? `[Scheduling] ${subjectBase}` : `【日程調整】${subjectBase}`,
    body: sanitizeSchedulingDraftBody(
      joinSchedulingDraftLines([
        greeting,
        "",
        opener || undefined,
        selfIntro,
        "",
        en
          ? `Regarding ${subjectBase}, please let us know which of the following times work for you.`
          : `${subjectBase}につき、下記候補日時からご都合をお知らせください。`,
        purposeLine || undefined,
        "",
        slots,
        formatLabel ? (en ? `Format: ${formatLabel}` : `形式: ${formatLabel}`) : undefined,
        caseRow.meeting_format === "in_person" && caseRow.location
          ? en
            ? `Location: ${caseRow.location}`
            : `場所: ${caseRow.location}`
          : undefined,
        caseRow.meeting_format === "in_person" && access
          ? en
            ? `Access: ${access}`
            : `アクセス: ${access}`
          : undefined,
        cost ? (en ? `Cost: ${cost}` : `・費用: ${cost}`) : undefined,
        "",
        closing,
        "",
        signature,
      ])
    ),
  };
}
