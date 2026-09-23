import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import {
  askCeoInline,
  loadCeoInlineQueue,
} from "../correspondence/ceo-inline-question.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { extractEmailAddress } from "./reply-parse.js";
import { resolveNextAction } from "./judgment-context.js";
import { normalizeScheduleMailSubject } from "./mail-match.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import {
  findSchedulingCase,
  loadSchedulingCases,
  nextSchedulingCaseId,
  updateSchedulingCase,
  upsertSchedulingCase,
} from "./store.js";

function loadUnlinkedQuestion(mailId: string) {
  return loadCeoInlineQueue().questions.find(
    (question) => question.mail_id === `schedule-intake:${mailId}` && question.status === "pending"
  );
}

function senderDisplayName(from: string): string {
  return from.replace(/<[^>]+>/g, "").replace(/^["']|["']$/g, "").trim() || "ご担当者";
}

export function askUnlinkedScheduleChoice(entry: MailTriageEntry, caseIds: string[]): void {
  const existing = loadUnlinkedQuestion(entry.id);
  if (existing) return;
  askCeoInline({
    mailId: `schedule-intake:${entry.id}`,
    subject: `日程メールの紐付け確認 — ${entry.subject}`,
    contextL1: "既存案件との紐付けが一意に決まりません。1件選択してください。",
    fields: [{
      id: "schedule_intake_choice",
      label: "紐付け先",
      type: "choice",
      choices: [...caseIds, "新規起票", "保留"],
    }],
  });
}

export function createSafeScheduleIntake(entry: MailTriageEntry): SchedulingCase | undefined {
  const email = entry.sender_email ?? extractEmailAddress(entry.from);
  if (!entry.sender_known || !email || !entry.subject.trim()) return undefined;
  const now = new Date().toISOString();
  const file = loadSchedulingCases();
  const caseRow = upsertSchedulingCase(
    resolveNextAction({
      id: nextSchedulingCaseId(file.cases),
      title: normalizeScheduleMailSubject(entry.subject) || "日程調整",
      status: "needs_review",
      created_at: now,
      updated_at: now,
      participants: [{
        id: "PART-001",
        name: senderDisplayName(entry.from),
        email,
        contact_ref: entry.sender_contact_ref,
        role: "external",
        response: "pending",
      }],
      proposed_slots: [],
      duration_minutes: 60,
      mail_thread_ids: [
        ...new Set([entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(Boolean)),
      ] as string[],
      processed_mail_ids: [],
      exception_reason: "schedule_intake_confirmation_required",
      next_action: "none",
    })
  );
  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseRow.id,
    mail_thread_ids: caseRow.mail_thread_ids,
  });
  recordSchedulingLifecycleEvent(caseRow.id, "created", "mail-intake");
  askCeoInline({
    mailId: `schedule-intake-case:${caseRow.id}:${entry.id}`,
    subject: `日程調整の起票確認 — ${caseRow.title}`,
    contextL1: `${senderDisplayName(entry.from)}からの日程メールを安全保留で起票しました。`,
    fields: [{
      id: "schedule_intake_choice",
      label: "この案件として調整を開始しますか？",
      type: "choice",
      choices: ["続行", "中止"],
    }],
  });
  return findSchedulingCase(caseRow.id) ?? caseRow;
}

export function linkMailToCase(caseId: string, mailId: string): SchedulingCase {
  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new Error(`Scheduling case ${caseId} not found`);

  const entry = findTriageEntry(mailId);
  if (!entry) throw new Error(`Mail triage entry ${mailId} not found`);

  const threadIds = new Set(caseRow.mail_thread_ids);
  threadIds.add(mailId);
  if (entry.source_message_id) threadIds.add(entry.source_message_id);

  const desired = resolveNextAction({
    ...caseRow,
    mail_thread_ids: [...threadIds],
    updated_at: new Date().toISOString(),
  });
  const result = updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);

  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseId,
    mail_thread_ids: [...new Set([...(entry.mail_thread_ids ?? []), ...result.mail_thread_ids])],
  });

  return result;
}
