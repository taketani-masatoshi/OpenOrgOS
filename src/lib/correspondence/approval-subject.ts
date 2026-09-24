/** Leaf module: imported by org/approval, so it must not import correspondence or approval code. */
export const CORRESPONDENCE_APPROVAL_SUBJECT_TYPES = [
  "correspondence.email",
  "correspondence.slack",
] as const;

export type CorrespondenceApprovalSubjectType =
  (typeof CORRESPONDENCE_APPROVAL_SUBJECT_TYPES)[number];

export function isCorrespondenceApprovalSubject(
  subjectType: string
): subjectType is CorrespondenceApprovalSubjectType {
  return (CORRESPONDENCE_APPROVAL_SUBJECT_TYPES as readonly string[]).includes(subjectType);
}
