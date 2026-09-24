import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import { getCorrespondenceHooks } from "./hooks.js";
import { findSenderIdentification } from "./sender-identification-queue.js";
import { confirmSenderFromCeo } from "./sender-identification.js";

function isAffirmative(value?: string): boolean {
  return value === "yes" || value === "はい" || value === "true";
}

function applySenderIdentificationAnswer(question: CeoInlineQuestion): void {
  const idEntry = findSenderIdentification(question.mail_id);
  if (!idEntry || (idEntry.status !== "pending_ceo" && idEntry.status !== "pending_enrichment")) {
    return;
  }

  const answers = question.answers ?? {};
  const name =
    answers.sender_name?.trim() ||
    answers.name?.trim() ||
    answers.note
      ?.trim()
      ?.split(/[·,、]/)[0]
      ?.trim();
  if (!name) return;

  confirmSenderFromCeo({
    mailId: question.mail_id,
    name,
    org: answers.org?.trim() || answers.organization?.trim(),
    department: answers.department?.trim(),
    role: answers.role?.trim(),
    relationship: answers.relationship?.trim(),
    notes: answers.note?.trim() || answers.schedule_note?.trim() || answers.p0_priority?.trim(),
    webSearchTrusted:
      isAffirmative(answers.web_search_trusted) || isAffirmative(answers.interpret_confirm),
    confirmedBy: question.answered_by,
  });
}

/** CEO 回答後の副作用 — scheduling（hooks）· sender identification */
export async function applyCeoInlineAnswerSideEffects(question: CeoInlineQuestion): Promise<void> {
  if (question.status !== "answered" || !question.answers) return;

  const handled = await getCorrespondenceHooks().onCeoInlineAnswered?.(question);
  if (handled) return;

  applySenderIdentificationAnswer(question);
}
