import {
  dismissPendingSchedulingQuestions,
  loadCeoInlineQueue,
  saveCeoInlineQueue,
} from "../correspondence/ceo-inline-question.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { caseNeedsCeoIntake, SCHEDULE_INTAKE_PENDING } from "./ceo-gates.js";
import { findSchedulingCase } from "./store.js";

export function extractSchedulingCaseIdFromMailId(mailId: string): string | undefined {
  const intake = mailId.match(/^schedule-intake-case:(SCH-\d{4}-\d{3}):/);
  if (intake) return intake[1];
  const scheduling = mailId.match(/^scheduling:(SCH-\d{4}-\d{3})$/);
  if (scheduling) return scheduling[1];
  return undefined;
}

function isTerminalSchedulingCase(caseRow: SchedulingCase): boolean {
  return (
    caseRow.status === "closed" ||
    caseRow.status === "cancelled" ||
    Boolean(caseRow.exception_reason?.startsWith("duplicate"))
  );
}

function isIntakeConfirmationQuestion(question: CeoInlineQuestion): boolean {
  return (
    question.mail_id.startsWith("schedule-intake:") ||
    question.mail_id.startsWith("schedule-intake-case:") ||
    question.fields.some((f) => f.id === "schedule_intake_choice")
  );
}

function caseStillNeedsIntakeConfirmation(caseRow: SchedulingCase): boolean {
  return (
    caseRow.exception_reason === "schedule_intake_confirmation_required" ||
    caseRow.exception_reason === SCHEDULE_INTAKE_PENDING ||
    (caseNeedsCeoIntake(caseRow) && caseRow.status === "open" && !caseRow.ceo_question_id)
  );
}

/**
 * 起票確認が残ったまま再提案質問へ進んだ等、superseded pending を dismiss 対象にする。
 */
export function isSupersededSchedulingCeoQuestion(
  question: CeoInlineQuestion,
  caseRow: SchedulingCase
): boolean {
  if (isTerminalSchedulingCase(caseRow)) return true;

  // 案件の現行 CEO 質問が別 ID に差し替わっている
  if (caseRow.ceo_question_id && caseRow.ceo_question_id !== question.id) return true;

  // 起票確認質問だが、案件は既に起票後のゲート／連絡先整理等へ進んでいる
  if (isIntakeConfirmationQuestion(question) && !caseStillNeedsIntakeConfirmation(caseRow)) {
    return true;
  }

  return false;
}

/**
 * closed / cancelled / duplicate / superseded の pending CEO 質問を dismiss。
 * Today / ops-poll 入口で呼び、「処理済みなのに起票確認が残る」ドリフトを防ぐ。
 */
export function reconcileStaleSchedulingCeoQuestions(): string[] {
  const queue = loadCeoInlineQueue();
  const dismissed: string[] = [];
  const terminalCaseIds = new Set<string>();
  let changed = false;

  queue.questions = queue.questions.map((question) => {
    if (question.status !== "pending") return question;
    const caseId =
      question.scheduling_case_id ?? extractSchedulingCaseIdFromMailId(question.mail_id);
    if (!caseId) return question;
    const caseRow = findSchedulingCase(caseId);
    if (!caseRow) return question;

    if (isTerminalSchedulingCase(caseRow)) {
      terminalCaseIds.add(caseId);
      dismissed.push(question.id);
      return question;
    }

    if (!isSupersededSchedulingCeoQuestion(question, caseRow)) return question;
    dismissed.push(question.id);
    changed = true;
    return { ...question, status: "dismissed" as const };
  });

  if (changed) saveCeoInlineQueue(queue);

  for (const caseId of terminalCaseIds) {
    dismissPendingSchedulingQuestions(caseId);
  }

  return [...new Set(dismissed)];
}
