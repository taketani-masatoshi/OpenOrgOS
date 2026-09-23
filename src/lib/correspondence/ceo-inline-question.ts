import { join } from "node:path";
import {
  ceoInlineQueueSchema,
  type CeoInlineQuestion,
  type CeoInlineQueue,
} from "../../../schemas/correspondence/ceo-inline-question.js";
import { loadRegistryFile, writeYamlFile, getDataDir } from "../utils.js";

export function getCeoInlineQueuePath(): string {
  return join(getDataDir(), "executive", "ceo-inline-questions.yaml");
}

export function loadCeoInlineQueue(): CeoInlineQueue {
  return loadRegistryFile(getCeoInlineQueuePath(), ceoInlineQueueSchema, () =>
    ceoInlineQueueSchema.parse({ version: 1, questions: [] })
  );
}

export function saveCeoInlineQueue(queue: CeoInlineQueue): void {
  writeYamlFile(getCeoInlineQueuePath(), ceoInlineQueueSchema.parse(queue));
}

function nextQuestionId(queue: CeoInlineQueue): string {
  let max = 0;
  for (const q of queue.questions) {
    const m = q.id.match(/^CEO-Q-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `CEO-Q-${String(max + 1).padStart(3, "0")}`;
}

export function findCeoInlineQuestion(id: string): CeoInlineQuestion | undefined {
  return loadCeoInlineQueue().questions.find((q) => q.id === id);
}

export function findCeoInlineQuestionByMailId(mailId: string): CeoInlineQuestion | undefined {
  return loadCeoInlineQueue().questions.find((q) => q.mail_id === mailId);
}

export function listPendingCeoInlineQuestions(): CeoInlineQuestion[] {
  return loadCeoInlineQueue().questions.filter((q) => q.status === "pending");
}

export function dismissPendingSchedulingQuestions(caseId: string): void {
  const queue = loadCeoInlineQueue();
  let changed = false;
  queue.questions = queue.questions.map((question) => {
    if (question.scheduling_case_id !== caseId || question.status !== "pending") {
      return question;
    }
    changed = true;
    return { ...question, status: "dismissed" as const };
  });
  if (changed) saveCeoInlineQueue(queue);
}

/** CONSULT MD の代わり — Today / Steward Chat で短く答えられる構造化質問 */
export function askCeoInline(opts: {
  mailId: string;
  subject: string;
  contextL1: string;
  fields: CeoInlineQuestion["fields"];
  schedulingCaseId?: string;
}): CeoInlineQuestion {
  const queue = loadCeoInlineQueue();
  const existing = queue.questions.find(
    (q) =>
      q.status === "pending" &&
      (q.mail_id === opts.mailId ||
        (opts.schedulingCaseId && q.scheduling_case_id === opts.schedulingCaseId))
  );
  if (existing) return existing;

  const question: CeoInlineQuestion = {
    id: nextQuestionId(queue),
    mail_id: opts.mailId,
    scheduling_case_id: opts.schedulingCaseId,
    subject: opts.subject,
    context_l1: opts.contextL1.slice(0, 1000),
    fields: opts.fields,
    status: "pending",
    asked_at: new Date().toISOString(),
  };
  queue.questions.unshift(question);
  saveCeoInlineQueue(queue);
  return question;
}

export function answerCeoInline(
  id: string,
  answers: Record<string, string>,
  answeredBy?: string
): CeoInlineQuestion {
  const queue = loadCeoInlineQueue();
  const idx = queue.questions.findIndex((q) => q.id === id);
  if (idx < 0) throw new Error(`CEO inline question not found: ${id}`);
  const updated: CeoInlineQuestion = {
    ...queue.questions[idx]!,
    status: "answered",
    answered_at: new Date().toISOString(),
    answers,
    answered_by: answeredBy,
  };
  queue.questions[idx] = updated;
  saveCeoInlineQueue(queue);
  return updated;
}

export function formatCeoInlineForToday(q: CeoInlineQuestion): string {
  const lines = [`**${q.subject}** (${q.id})`, "", q.context_l1, ""];
  for (const f of q.fields) {
    lines.push(`- ${f.label}`);
  }
  lines.push("", "Steward Chat の CEO 質問から回答してください。");
  return lines.join("\n");
}

export function formatCeoInlineQuestionDetail(q: CeoInlineQuestion): string {
  const lines = [
    `${q.id} · ${q.status} · mail ${q.mail_id}`,
    `件名: ${q.subject}`,
    "",
    q.context_l1,
    "",
    "質問:",
  ];
  for (const f of q.fields) {
    const answer = q.answers?.[f.id];
    lines.push(`- [${f.id}] ${f.label} (${f.type})${answer ? `: ${answer}` : ""}`);
    if (f.choices?.length) lines.push(`  選択肢: ${f.choices.join(" · ")}`);
  }
  if (q.status === "pending") {
    lines.push("", `回答: orgos mail intake ceo answer --id ${q.id} --field <id> <value> ...`);
  }
  return lines.join("\n");
}
