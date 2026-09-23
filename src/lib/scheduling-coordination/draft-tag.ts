/**
 * Single parser for `scheduling-case:SCH-YYYY-NNN` tags in draft notes / mail ids.
 */
const SCHEDULING_CASE_TAG =
  /\bscheduling-case:(SCH-\d{4}-\d{3})\b/;
const SCHEDULING_CASE_ID = /^(SCH-\d{4}-\d{3})$/;

export function parseSchedulingCaseIdFromNotes(notes?: string): string | undefined {
  return notes?.match(SCHEDULING_CASE_TAG)?.[1];
}

export function isSchedulingCaseId(id: string): boolean {
  return SCHEDULING_CASE_ID.test(id);
}

export function notesMentionSchedulingCase(notes?: string): boolean {
  return Boolean(notes && SCHEDULING_CASE_TAG.test(notes));
}
