/**
 * Registers scheduling handlers on correspondence hooks.
 * Composition root (CLI · fixtures · commands) must call ensure once.
 */
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import {
  registerCorrespondenceHooks,
  type SchedulingCaseContext,
} from "../correspondence/hooks.js";
import { findMailInterpretation } from "../correspondence/mail-interpretation.js";
import { runScheduleCoordinationAutoProcess } from "./auto-process.js";
import { applySchedulingCeoAnswer } from "./ceo-confirm.js";
import {
  schedulingCaseHasCostLine,
  schedulingCaseLooksLikeMeal,
} from "./draft-text.js";
import { handleSchedulingCorrespondenceSent } from "./lifecycle.js";
import { nextActionLabel } from "./next-action.js";
import { applyScheduleIntakeAnswer } from "./process-mail.js";
import { recordSecretaryDraftEditIfBodyChanged } from "./quality-signals.js";
import { runSchedulingReminderPoll } from "./reminder-poller.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

function toContext(id: string): SchedulingCaseContext | undefined {
  const sch = findSchedulingCase(id);
  if (!sch) return undefined;
  return {
    id: sch.id,
    title: sch.title,
    status: sch.status,
    next_action: sch.next_action,
    next_action_label: nextActionLabel(sch.next_action),
    reminder_due_at: sch.reminder_due_at,
    mail_thread_ids: sch.mail_thread_ids ?? [],
    meeting_format: sch.meeting_format,
    looks_like_meal: schedulingCaseLooksLikeMeal(sch),
    has_cost_line: schedulingCaseHasCostLine(sch),
  };
}

function formatSchedulingHandoffSection(entry: MailTriageEntry): string[] | undefined {
  if (!entry.scheduling_case_id) {
    const interp = findMailInterpretation(entry.id);
    if (interp?.intent === "schedule") {
      return ["- intent: schedule · **案件未紐付け**"];
    }
    return undefined;
  }
  const sch = findSchedulingCase(entry.scheduling_case_id);
  if (!sch) return [`- case: ${entry.scheduling_case_id}（未找到）`];
  return [
    `- case: **${sch.id}** · ${sch.title}`,
    `- status: ${sch.status} · next: ${nextActionLabel(sch.next_action)}`,
    entry.schedule_reply_parsed ? "- 返信パース: 済" : "- 返信パース: 未",
  ];
}

function recommendSchedulingActions(entry: MailTriageEntry): string[] | undefined {
  const actions: string[] = [];
  const interp = findMailInterpretation(entry.id);
  if (entry.scheduling_case_id) {
    const sch = findSchedulingCase(entry.scheduling_case_id);
    if (sch) {
      actions.push(
        `日程調整案件 ${sch.id} · 次: ${nextActionLabel(sch.next_action)} · \`orgos executive scheduling draft --id ${sch.id} --write-draft\``
      );
    }
  } else if (interp?.intent === "schedule") {
    actions.push(
      "日程意図 — 既存案件へ `orgos executive scheduling link-mail` または `executive scheduling process --all`"
    );
  }
  return actions.length ? actions : undefined;
}

function isScheduleIntakeQuestion(question: CeoInlineQuestion): boolean {
  return (
    question.mail_id.startsWith("schedule-intake:") ||
    question.mail_id.startsWith("schedule-intake-case:")
  );
}

function isSchedulingCaseQuestion(question: CeoInlineQuestion): boolean {
  return Boolean(question.scheduling_case_id) || question.mail_id.startsWith("scheduling:");
}

async function onCeoInlineAnswered(question: CeoInlineQuestion): Promise<boolean> {
  if (isScheduleIntakeQuestion(question)) {
    await applyScheduleIntakeAnswer(question);
    return true;
  }
  if (isSchedulingCaseQuestion(question)) {
    await applySchedulingCeoAnswer(question);
    return true;
  }
  return false;
}

let bound = false;

export function ensureSchedulingCorrespondenceHooks(): void {
  if (bound) return;
  bound = true;
  registerCorrespondenceHooks({
    loadSchedulingCase: toContext,
    onSchedulingCaseSent: ({ caseId, reminderDueAt }) => {
      const sch = findSchedulingCase(caseId);
      if (!sch) return;
      updateSchedulingCase(sch.id, sch.revision, (current) => ({
        ...current,
        reminder_due_at: reminderDueAt,
      }));
    },
    onDraftApproved: (draft: CorrespondenceDraft, caseId: string) => {
      recordSecretaryDraftEditIfBodyChanged(caseId, draft);
    },
    onCorrespondenceSent: (draft: CorrespondenceDraft) => {
      if (draft.notes?.includes("scheduling-case:")) {
        handleSchedulingCorrespondenceSent(draft);
      }
    },
    formatSchedulingHandoffSection,
    recommendSchedulingActions,
    onCeoInlineAnswered,
    afterMailReceiveCycle: async ({ fetched, autoScheduleCoordination, now }) => {
      if (fetched > 0 && autoScheduleCoordination) {
        await runScheduleCoordinationAutoProcess();
      }
      await runSchedulingReminderPoll(now);
    },
  });
}

/** Test isolation — allows re-bind after resetCorrespondenceHooksForTests. */
export function resetSchedulingCorrespondenceHooksBindingForTests(): void {
  bound = false;
}
