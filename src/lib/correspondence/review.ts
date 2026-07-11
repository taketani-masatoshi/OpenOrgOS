import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { loadCorrespondenceDraft } from "./draft.js";
import { CORRESPONDENCE_CLI } from "./cli-labels.js";

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

export function loadCorrespondenceDraftForApproval(
  approval: OrgApprovalRequest
): CorrespondenceDraft | null {
  if (!isCorrespondenceApprovalSubject(approval.subject_type)) return null;
  if (!approval.subject_ref) return null;
  try {
    return loadCorrespondenceDraft(approval.subject_ref);
  } catch {
    return null;
  }
}

export function formatCorrespondenceDraftReview(draft: CorrespondenceDraft): string {
  const lines = [
    "── 対外連絡下書き（承認前に全文確認） ──",
    "",
    `draft_id: ${draft.draft_id}`,
    `status: ${draft.status}`,
    `approval_id: ${draft.approval_id ?? "—"}`,
    `created_by: ${draft.created_by}`,
  ];
  if (draft.channel === "email") {
    lines.push(`from: (送信時) records/executive/mail-config.yaml の from`);
    lines.push(`to: ${draft.to ?? "—"}`);
    lines.push(`cc: ${draft.cc ?? "—"}`);
    lines.push(`subject: ${draft.subject ?? "—"}`);
    lines.push("", "── 本文 ──", draft.body.trimEnd(), "");
  } else {
    lines.push(`slack_channel: ${draft.slack_channel ?? "—"}`);
    lines.push("", "── 本文 ──", draft.body.trimEnd(), "");
  }
  if (draft.notes) {
    lines.push("── 内部メモ ──", draft.notes, "");
  }
  lines.push(
    "── 次の操作 ──",
    `確認後: org approval approve --id ${draft.approval_id ?? "APR-..."} --approver "<CEO>" --reviewed`,
    `送信:   ${CORRESPONDENCE_CLI.send} --id ${draft.draft_id}  (ceo/approver · operator 認証必須)`
  );
  return lines.join("\n");
}

export class CorrespondenceReviewRequiredError extends Error {
  readonly preview: string;

  constructor(preview: string) {
    super(
      "Correspondence approval requires --reviewed after reading the draft preview above. " +
        `Run: orgos ${CORRESPONDENCE_CLI.show} --id <DRAFT-...>`
    );
    this.name = "CorrespondenceReviewRequiredError";
    this.preview = preview;
  }
}

export function assertCorrespondenceReviewAcknowledged(opts: {
  approval: OrgApprovalRequest;
  reviewed?: boolean;
}): void {
  if (!isCorrespondenceApprovalSubject(opts.approval.subject_type)) return;
  const draft = loadCorrespondenceDraftForApproval(opts.approval);
  if (!draft) {
    throw new Error(
      `Correspondence draft ${opts.approval.subject_ref ?? "?"} not found — cannot approve without review`
    );
  }
  const preview = formatCorrespondenceDraftReview(draft);
  if (!opts.reviewed) {
    throw new CorrespondenceReviewRequiredError(preview);
  }
}
