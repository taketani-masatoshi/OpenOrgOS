import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { hasVenueOptionTrio, venueNamesMatch } from "./venue-gate.js";

export function parseVenueLine(line: string): { name: string; facts?: string } {
  const trimmed = line.trim();
  const dash = trimmed.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (dash) {
    return { name: dash[1]!.trim(), facts: dash[2]!.trim() };
  }
  return { name: trimmed };
}

export function hasVenueOptions(
  caseRow: Pick<SchedulingCase, "venue_options" | "notes">
): boolean {
  if ((caseRow.venue_options?.length ?? 0) >= 3) return true;
  return hasVenueOptionTrio(caseRow.notes);
}

/** 第一候補文字列が A/B/C のどれに当たるか（表記ゆれ許容） */
export function resolveFirstPickId(
  firstPick: string,
  options: Array<{ id: "A" | "B" | "C"; name: string; raw: string }>
): "A" | "B" | "C" | undefined {
  const exact = options.find(
    (o) =>
      venueNamesMatch(firstPick, o.name) ||
      venueNamesMatch(firstPick, o.raw) ||
      firstPick.trim() === o.id ||
      firstPick.trim().toUpperCase() === `案${o.id}` ||
      firstPick.trim().toUpperCase() === `会場案${o.id}`
  );
  return exact?.id;
}

export function clarifySentForRevision(caseRow: SchedulingCase): boolean {
  const externalIds = caseRow.participants
    .filter((p) => p.role === "external")
    .map((p) => p.id);
  if (!externalIds.length) return false;
  return externalIds.every((participantId) =>
    caseRow.correspondence.some(
      (record) =>
        record.kind === "clarify" &&
        record.participant_id === participantId &&
        record.proposal_revision === caseRow.proposal_revision &&
        Boolean(record.sent_at)
    )
  );
}

export function clarifyDraftedForRevision(caseRow: SchedulingCase): boolean {
  const externalIds = caseRow.participants
    .filter((p) => p.role === "external")
    .map((p) => p.id);
  if (!externalIds.length) return false;
  return externalIds.every((participantId) =>
    caseRow.correspondence.some(
      (record) =>
        record.kind === "clarify" &&
        record.participant_id === participantId &&
        record.proposal_revision === caseRow.proposal_revision
    )
  );
}

/** 対面 · intake 済み · 会場3案未入力 */
export function needsVenueClarifyInput(
  caseRow: Pick<
    SchedulingCase,
    "meeting_format" | "ceo_intake_confirmed" | "venue_options" | "status" | "notes"
  >
): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  if (!caseRow.ceo_intake_confirmed) return false;
  if (caseRow.status === "cancelled" || caseRow.status === "closed") return false;
  if (caseRow.status === "confirmed" || caseRow.status === "notifying") return false;
  return !hasVenueOptions(caseRow);
}

/** 候補日提示前 · 会場 clarify メール未送信 */
export function needsClarifyBeforeProposal(caseRow: SchedulingCase): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  if (!hasVenueOptions(caseRow)) return false;
  return !clarifySentForRevision(caseRow);
}
