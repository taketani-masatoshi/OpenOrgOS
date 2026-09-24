/** Mail intake — CEO inline question CLI. */
import {
  listPendingCeoInlineQuestions,
  loadCeoInlineQueue,
  findCeoInlineQuestion,
  answerCeoInline,
  formatCeoInlineQuestionDetail,
} from "../lib/correspondence/ceo-inline-question.js";
import { applyCeoInlineAnswerSideEffects } from "../lib/correspondence/ceo-inline-answer.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

/** `--field <fieldId> <value>` を argv から抽出（繰り返し可） */
export function parseCeoFieldArgs(argv: readonly string[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (let i = 0; i < argv.length - 2; i++) {
    if (argv[i] === "--field") {
      answers[argv[i + 1]!] = argv[i + 2]!;
      i += 2;
    }
  }
  return answers;
}

export function runMailIntakeCeoList(opts: { json?: boolean; pending?: boolean }): void {
  const questions =
    opts.pending === false ? loadCeoInlineQueue().questions : listPendingCeoInlineQuestions();
  if (opts.json) {
    console.log(JSON.stringify(questions, null, 2));
    return;
  }
  if (!questions.length) {
    console.log("（CEO インライン質問なし）");
    return;
  }
  for (const q of questions) {
    console.log(formatCeoInlineQuestionDetail(q));
    console.log("---");
  }
}

export function runMailIntakeCeoShow(opts: { id: string; json?: boolean }): void {
  const question = findCeoInlineQuestion(opts.id);
  if (!question) {
    console.error(`CEO inline question not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(question, null, 2));
    return;
  }
  console.log(formatCeoInlineQuestionDetail(question));
}

export async function runMailIntakeCeoAnswer(opts: {
  id: string;
  fields: Record<string, string>;
  operator?: string;
  json?: boolean;
}): Promise<void> {
  requireCliDataWrite({ command: "mail intake ceo answer", permission: "escalate:plan" });
  auditCliMutation("mail intake ceo answer", "answer");
  const question = findCeoInlineQuestion(opts.id);
  if (!question) {
    console.error(`CEO inline question not found: ${opts.id}`);
    process.exit(1);
  }
  if (question.status !== "pending") {
    console.error(`Question ${opts.id} is already ${question.status}`);
    process.exit(1);
  }
  if (!Object.keys(opts.fields).length) {
    console.error("No --field answers provided");
    process.exit(1);
  }
  const updated = answerCeoInline(opts.id, opts.fields, opts.operator);
  await applyCeoInlineAnswerSideEffects(updated);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }
  console.log(`✓ CEO 回答記録: ${opts.id}`);
  console.log(formatCeoInlineQuestionDetail(updated));
}
