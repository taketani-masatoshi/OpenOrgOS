/**
 * Extension points for optional consumers (scheduling-coordination, etc.).
 * Correspondence must not import those consumers; they register binders instead.
 * Composition roots import register-correspondence-hooks once; getCorrespondenceHooks() runs binders.
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

export interface DraftStyleLintEnrichment {
  meetingFormat?: "online" | "in_person" | "unspecified";
  isMeal?: boolean;
  hasCostLine?: boolean;
}

export interface CorrespondenceHooks {
  loadSchedulingCase?: (id: string) => SchedulingCaseContext | undefined;
  /** Scheduling-aware style-lint context — prefer this over loadSchedulingCase in lint. */
  enrichDraftStyleContext?: (draft: CorrespondenceDraft) => DraftStyleLintEnrichment | undefined;
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
let warnedMissingBinder = false;

function isTestRuntime(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

function warnOrThrowMissingBinder(): void {
  if (binders.length > 0) return;
  if (process.env.ORGOS_REQUIRE_CORRESPONDENCE_HOOKS === "1") {
    throw new Error(
      "correspondence hooks binder is not registered — import src/lib/composition/register-correspondence-hooks.js from the composition root"
    );
  }
  if (warnedMissingBinder || isTestRuntime()) return;
  warnedMissingBinder = true;
  console.warn(
    "[correspondence] no hooks binder registered — scheduling side-effects are no-ops. Import src/lib/composition/register-correspondence-hooks.js from the composition root."
  );
}

/** Called by consumer packages (e.g. scheduling) at module load. */
export function registerCorrespondenceHooksBinder(binder: HooksBinder): void {
  if (!binders.includes(binder)) binders.push(binder);
}

export function registerCorrespondenceHooks(partial: CorrespondenceHooks): void {
  hooks = { ...hooks, ...partial };
}

export function getCorrespondenceHooks(): CorrespondenceHooks {
  warnOrThrowMissingBinder();
  for (const binder of binders) binder();
  return hooks;
}

/** True when at least one binder was registered (composition root loaded). */
export function hasCorrespondenceHooksBinder(): boolean {
  return binders.length > 0;
}

/** Test isolation — clears hooks and notifies binders to allow re-bind. */
export function resetCorrespondenceHooksForTests(): void {
  hooks = {};
  warnedMissingBinder = false;
  onResetForTests?.();
}

/** Binders register this so reset clears their "already bound" flag. */
export function setCorrespondenceHooksResetHook(fn: () => void): void {
  onResetForTests = fn;
}
