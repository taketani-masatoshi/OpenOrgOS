import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import type {
  CorrespondenceCaseRef,
  CorrespondenceDomainAdapters,
  CorrespondenceStyleLintContext,
} from "../correspondence/domain-adapters.js";
import { resolveMailConfig } from "../correspondence/mail-config.js";
import { runScheduleCoordinationAutoProcess } from "./auto-process.js";
import { applySchedulingCeoAnswer } from "./ceo-confirm.js";
import { handleSchedulingCorrespondenceSent } from "./correspondence-sent.js";
import {
  isSchedulingCaseId,
  notesMentionSchedulingCase,
  parseSchedulingCaseIdFromNotes,
} from "./draft-tag.js";
import {
  schedulingCaseHasCostLine,
  schedulingCaseLooksLikeMeal,
} from "./meal-cost.js";
import { nextActionLabel } from "./next-action.js";
import { applyScheduleIntakeAnswer } from "./process-mail.js";
import { recordSecretaryDraftEditIfBodyChanged } from "./quality-signals.js";
import { runSchedulingReminderPoll } from "./reminder-poller.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

function schedulingToRef(
  sch: NonNullable<ReturnType<typeof findSchedulingCase>>
): CorrespondenceCaseRef {
  return {
    kind: "scheduling",
    id: sch.id,
    status: sch.status,
    next_action: sch.next_action,
    next_action_due: sch.reminder_due_at?.slice(0, 10),
    mail_thread_ids: sch.mail_thread_ids ?? [],
    gmail_thread_ids: [],
    subject: sch.title,
  };
}

export function createSchedulingCorrespondenceAdapter(): CorrespondenceDomainAdapters {
  return {
    parseCaseIdFromNotes(notes) {
      return parseSchedulingCaseIdFromNotes(notes);
    },
    notesMentionDomainCase(notes) {
      return notesMentionSchedulingCase(notes);
    },
    caseRef(id) {
      if (!isSchedulingCaseId(id)) return undefined;
      const sch = findSchedulingCase(id);
      return sch ? schedulingToRef(sch) : undefined;
    },
    onDraftApproved(draft) {
      const caseId = parseSchedulingCaseIdFromNotes(draft.notes);
      if (caseId) recordSecretaryDraftEditIfBodyChanged(caseId, draft);
    },
    onDraftSent(draft, _opts) {
      if (!notesMentionSchedulingCase(draft.notes)) return;
      handleSchedulingCorrespondenceSent(draft);
    },
    onFollowUpDue(caseId, dueDateIso) {
      const sch = findSchedulingCase(caseId);
      if (!sch) return;
      updateSchedulingCase(sch.id, sch.revision, (current) => ({
        ...current,
        reminder_due_at: dueDateIso,
      }));
    },
    async onCeoAnswer(question: CeoInlineQuestion): Promise<boolean> {
      if (
        question.mail_id.startsWith("schedule-intake:") ||
        question.mail_id.startsWith("schedule-intake-case:")
      ) {
        await applyScheduleIntakeAnswer(question);
        return true;
      }
      if (question.scheduling_case_id || question.mail_id.startsWith("scheduling:")) {
        await applySchedulingCeoAnswer(question);
        return true;
      }
      return false;
    },
    styleLintContext(draft: CorrespondenceDraft): CorrespondenceStyleLintContext {
      const caseId = parseSchedulingCaseIdFromNotes(draft.notes);
      if (!caseId) return {};
      try {
        const sch = findSchedulingCase(caseId);
        if (!sch) return {};
        return {
          meetingFormat: sch.meeting_format,
          isMeal: schedulingCaseLooksLikeMeal(sch),
          hasCostLine: schedulingCaseHasCostLine(sch),
        };
      } catch {
        return {};
      }
    },
    handoffSection(entry: MailTriageEntry): string[] {
      if (!entry.scheduling_case_id) return [];
      const sch = findSchedulingCase(entry.scheduling_case_id);
      if (!sch) return [`- case: ${entry.scheduling_case_id}（未找到）`];
      return [
        `- case: **${sch.id}** · ${sch.title}`,
        `- status: ${sch.status} · next: ${nextActionLabel(sch.next_action)}`,
        entry.schedule_reply_parsed ? "- 返信パース: 済" : "- 返信パース: 未",
      ];
    },
    handoffActions(entry: MailTriageEntry): string[] {
      if (!entry.scheduling_case_id) return [];
      const sch = findSchedulingCase(entry.scheduling_case_id);
      if (!sch) return [];
      return [
        `日程調整案件 ${sch.id} · 次: ${nextActionLabel(sch.next_action)} · \`orgos executive scheduling draft --id ${sch.id} --write-draft\``,
      ];
    },
    async onMailPoll(now, ctx) {
      const config = resolveMailConfig();
      if (
        ctx.fetchedAndTriaged &&
        config?.receive?.auto_schedule_coordination !== false
      ) {
        await runScheduleCoordinationAutoProcess();
      }
      await runSchedulingReminderPoll(now);
    },
  };
}
