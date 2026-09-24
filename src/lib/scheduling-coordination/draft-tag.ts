/**
 * Single parser / formatter for `scheduling-case:SCH-YYYY-NNN` tags in draft notes.
 */
const SCHEDULING_CASE_TAG =
  /\bscheduling-case:(SCH-\d{4}-\d{3})\b/;
const SCHEDULING_CASE_ID = /^(SCH-\d{4}-\d{3})$/;
const DRAFT_KIND_TAG =
  /\bkind:(clarify|proposal|reminder|confirm)\b/;
const PARTICIPANT_TAG = /\bparticipant:(PART-\d{3})\b/;
const REVISION_TAG = /\brevision:(\d+)\b/;

export type SchedulingDraftNotesKind =
  | "clarify"
  | "proposal"
  | "reminder"
  | "confirm";

export interface ParsedSchedulingDraftNotes {
  caseId?: string;
  kind?: SchedulingDraftNotesKind;
  participantId?: string;
  revision?: number;
}

export function formatSchedulingCaseTag(caseId: string): string {
  return `scheduling-case:${caseId}`;
}

export function parseSchedulingCaseIdFromNotes(notes?: string): string | undefined {
  return notes?.match(SCHEDULING_CASE_TAG)?.[1];
}

export function parseSchedulingDraftNotes(notes?: string): ParsedSchedulingDraftNotes {
  if (!notes) return {};
  const revisionRaw = notes.match(REVISION_TAG)?.[1];
  return {
    caseId: notes.match(SCHEDULING_CASE_TAG)?.[1],
    kind: notes.match(DRAFT_KIND_TAG)?.[1] as SchedulingDraftNotesKind | undefined,
    participantId: notes.match(PARTICIPANT_TAG)?.[1],
    revision: revisionRaw !== undefined ? Number(revisionRaw) : undefined,
  };
}

export function isSchedulingCaseId(id: string): boolean {
  return SCHEDULING_CASE_ID.test(id);
}

export function notesMentionSchedulingCase(notes?: string): boolean {
  return Boolean(notes && SCHEDULING_CASE_TAG.test(notes));
}

/** Batch key for multi-draft CEO approve (case + kind + proposal revision). */
export function schedulingCorrespondenceBatchKey(
  notes: string | undefined
): string | undefined {
  const parsed = parseSchedulingDraftNotes(notes);
  if (
    !parsed.caseId ||
    !parsed.kind ||
    parsed.kind === "clarify" ||
    parsed.revision === undefined
  ) {
    return undefined;
  }
  return `${parsed.caseId}:${parsed.kind}:${parsed.revision}`;
}
