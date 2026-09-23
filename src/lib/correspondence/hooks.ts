/**
 * Extension points for optional consumers (scheduling-coordination, etc.).
 * Correspondence must not import those consumers; they register binders instead.
 * Composition roots import the binder module once; getCorrespondenceHooks() runs binders.
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

type HooksBinder = () => void;

let hooks: CorrespondenceHooks = {};
const binders: HooksBinder[] = [];
let onResetForTests: (() => void) | undefined;

/** Called by consumer packages (e.g. scheduling) at module load. */
export function registerCorrespondenceHooksBinder(binder: HooksBinder): void {
  if (!binders.includes(binder)) binders.push(binder);
}

export function registerCorrespondenceHooks(partial: CorrespondenceHooks): void {
  hooks = { ...hooks, ...partial };
}

export function getCorrespondenceHooks(): CorrespondenceHooks {
  for (const binder of binders) binder();
  return hooks;
}

/** Test isolation — clears hooks and notifies binders to allow re-bind. */
export function resetCorrespondenceHooksForTests(): void {
  hooks = {};
  onResetForTests?.();
}

/** Binders register this so reset clears their "already bound" flag. */
export function setCorrespondenceHooksResetHook(fn: () => void): void {
  onResetForTests = fn;
}
