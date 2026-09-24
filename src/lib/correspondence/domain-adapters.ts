import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";

export type CorrespondenceCaseKind = "inquiry" | "deal" | "scheduling";

export interface CorrespondenceCaseRef {
  kind: CorrespondenceCaseKind;
  id: string;
  status: string;
  next_action?: string;
  next_action_due?: string;
  mail_thread_ids: string[];
  gmail_thread_ids: string[];
  company?: string;
  subject?: string;
}

/**
 * Domain hooks correspondence may call without importing domain modules.
 * Scheduling registers via bootstrap/registerDomainAdapters().
 */
export type CorrespondenceStyleLintContext = {
  meetingFormat?: "online" | "in_person" | "unspecified";
  isMeal?: boolean;
  hasCostLine?: boolean;
};

export type CorrespondenceDomainAdapters = {
  parseCaseIdFromNotes(notes?: string): string | undefined;
  notesMentionDomainCase(notes?: string): boolean;
  caseRef(id: string): CorrespondenceCaseRef | undefined;
  onDraftApproved(draft: CorrespondenceDraft): void;
  onDraftSent(draft: CorrespondenceDraft, opts: { dryRun: boolean }): void;
  /**
   * Post-send follow-up stamp (e.g. reminder_due_at).
   * Invert-deps keeps caller-provided +7d due; F4 switches computation.
   */
  onFollowUpDue(caseId: string, dueDateIso: string): void;
  /** @returns true if this question was handled by the domain. */
  onCeoAnswer(question: CeoInlineQuestion): Promise<boolean>;
  styleLintContext(draft: CorrespondenceDraft): CorrespondenceStyleLintContext;
  handoffSection(entry: MailTriageEntry): string[];
  handoffActions(entry: MailTriageEntry): string[];
  onMailPoll(
    now: Date,
    ctx: { fetchedAndTriaged: boolean }
  ): Promise<void>;
};

let registered: CorrespondenceDomainAdapters | undefined;

export function registerCorrespondenceDomainAdapters(
  adapters: CorrespondenceDomainAdapters
): void {
  registered = adapters;
}

export function requireCorrespondenceDomainAdapters(): CorrespondenceDomainAdapters {
  if (!registered) {
    throw new Error(
      "Correspondence domain adapters are not registered — call registerDomainAdapters() at process entry"
    );
  }
  return registered;
}

/** Test helper — clear registration between suites if needed. */
export function resetCorrespondenceDomainAdaptersForTests(): void {
  registered = undefined;
}
