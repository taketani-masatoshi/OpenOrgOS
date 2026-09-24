/**
 * Bridges main's correspondence hooks API to domain adapters (ADR 0079).
 * Composition roots import register-correspondence-hooks once.
 */
import {
  registerCorrespondenceHooks,
  registerCorrespondenceHooksBinder,
  setCorrespondenceHooksResetHook,
  type SchedulingCaseContext,
} from "../correspondence/hooks.js";
import {
  requireCorrespondenceDomainAdapters,
  resetCorrespondenceDomainAdaptersForTests,
} from "../correspondence/domain-adapters.js";
import {
  registerDomainAdapters,
  resetDomainAdaptersRegistrationForTests,
} from "../bootstrap/domain-adapters.js";
import { nextActionLabel } from "./next-action.js";
import type { SchedulingNextAction } from "../../../schemas/executive/scheduling-cases.js";

let bound = false;

function bindFromDomainAdapters(): void {
  if (bound) return;
  bound = true;
  registerDomainAdapters();
  const adapters = requireCorrespondenceDomainAdapters();

  registerCorrespondenceHooks({
    loadSchedulingCase(id): SchedulingCaseContext | undefined {
      const ref = adapters.caseRef(id);
      if (!ref || ref.kind !== "scheduling") return undefined;
      return {
        id: ref.id,
        title: ref.subject ?? ref.id,
        status: ref.status,
        next_action: ref.next_action ?? "none",
        next_action_label: nextActionLabel(
          (ref.next_action ?? "none") as SchedulingNextAction
        ),
        reminder_due_at: ref.next_action_due,
        mail_thread_ids: ref.mail_thread_ids ?? [],
        meeting_format: undefined,
        looks_like_meal: false,
        has_cost_line: false,
      };
    },
    enrichDraftStyleContext(draft) {
      return adapters.styleLintContext(draft);
    },
    onSchedulingCaseSent({ caseId, reminderDueAt }) {
      adapters.onFollowUpDue(caseId, reminderDueAt);
    },
    onDraftApproved(draft) {
      adapters.onDraftApproved(draft);
    },
    onCorrespondenceSent(draft) {
      adapters.onDraftSent(draft, { dryRun: false });
    },
    formatSchedulingHandoffSection(entry) {
      const lines = adapters.handoffSection(entry);
      return lines.length ? lines : undefined;
    },
    recommendSchedulingActions(entry) {
      const lines = adapters.handoffActions(entry);
      return lines.length ? lines : undefined;
    },
    onCeoInlineAnswered(question) {
      return adapters.onCeoAnswer(question);
    },
    async afterMailReceiveCycle(opts) {
      if (!opts.autoScheduleCoordination) return;
      await adapters.onMailPoll(opts.now, {
        fetchedAndTriaged: opts.fetched > 0,
      });
    },
  });
}

registerCorrespondenceHooksBinder(bindFromDomainAdapters);
setCorrespondenceHooksResetHook(() => {
  bound = false;
  resetDomainAdaptersRegistrationForTests();
  resetCorrespondenceDomainAdaptersForTests();
});

/** Idempotent ensure for callers that previously imported ensureSchedulingCorrespondenceHooks. */
export function ensureSchedulingCorrespondenceHooks(): void {
  bindFromDomainAdapters();
}
