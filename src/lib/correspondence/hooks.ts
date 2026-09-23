/**
 * Extension points for optional consumers (scheduling-coordination, etc.).
 * Correspondence must not import those consumers; they register here instead.
 */
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";

export interface SchedulingCaseContext {
  id: string;
  title: string;
  status: string;
  next_action: string;
  next_action_label: string;
  reminder_due_at?: string;
  mail_thread_ids: string[];
  meeting_format?: "online" | "in_person" | "unspecified";
  looks_like_meal: boolean;
  has_cost_line: boolean;
}

export interface CorrespondenceHooks {
  loadSchedulingCase?: (id: string) => SchedulingCaseContext | undefined;
  onSchedulingCaseSent?: (opts: { caseId: string; reminderDueAt: string }) => void;
  onDraftApproved?: (draft: CorrespondenceDraft, caseId: string) => void;
  onCorrespondenceSent?: (draft: CorrespondenceDraft) => void;
  formatSchedulingHandoffSection?: (entry: MailTriageEntry) => string[] | undefined;
  recommendSchedulingActions?: (entry: MailTriageEntry) => string[] | undefined;
  /** Return true when the answer was handled (scheduling intake / case). */
  onCeoInlineAnswered?: (question: CeoInlineQuestion) => boolean | Promise<boolean>;
  afterMailReceiveCycle?: (opts: {
    fetched: number;
    autoScheduleCoordination: boolean;
    now: Date;
  }) => Promise<void>;
}

let hooks: CorrespondenceHooks = {};

export function registerCorrespondenceHooks(partial: CorrespondenceHooks): void {
  hooks = { ...hooks, ...partial };
}

export function getCorrespondenceHooks(): CorrespondenceHooks {
  return hooks;
}

/** Test / isolation only. */
export function resetCorrespondenceHooksForTests(): void {
  hooks = {};
}
