import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import {
  mailInterpretationResultSchema,
  type MailInterpretVote,
  type MailInterpretationResult,
} from "../../../schemas/correspondence/mail-interpretation.js";
import { parseEmlHeaders } from "./mail-triage.js";
import { getMailReceivedDir } from "./paths.js";
import { postLlmChat } from "../operator-runtime/llm-chat.js";
import { getLlmApiConfig, isLlmMockEnabled } from "../operator-runtime/llm-api.js";
import {
  isMailInterpretEnsembleEnabled,
  majorityVote,
  majorityVoteBoolean,
  parseInterpretModelsFromEnv,
  pickSummaryFromVotes,
} from "./mail-interpret-ensemble.js";
import { loadRegistryFile, writeYamlFile, getDataDir } from "../utils.js";

const interpretResponseSchema = z.object({
  intent: z.enum([
    "schedule",
    "return_item",
    "invoice",
    "inquiry",
    "test",
    "spam",
    "unknown",
  ]),
  who_lent: z.enum(["sender", "recipient", "none", "unclear"]).optional(),
  who_must_return: z.enum(["sender", "recipient", "none", "unclear"]).optional(),
  action_required: z.boolean(),
  summary_l1: z.string().max(500),
  confidence: z.number().min(0).max(1).optional(),
});

const SYSTEM_PROMPT = `You interpret inbound business email for OrgOS Secretary (L1 only).
Return JSON only with keys: intent, who_lent, who_must_return, action_required, summary_l1, confidence.
who_lent: sender=差出人 lent to recipient=受信組織. who_must_return: who must return the item.
Japanese example: "あなたに貸したノートを返してください" → who_lent=sender, who_must_return=recipient.`;

const interpretationQueueSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(mailInterpretationResultSchema).default([]),
});

function interpretationQueuePath(): string {
  return join(getDataDir(), "executive", "mail-interpretation-queue.yaml");
}

export function loadMailInterpretationQueue() {
  return loadRegistryFile(interpretationQueuePath(), interpretationQueueSchema, () =>
    interpretationQueueSchema.parse({ version: 1, entries: [] })
  );
}

export function saveMailInterpretation(entry: MailInterpretationResult): void {
  const queue = loadMailInterpretationQueue();
  const idx = queue.entries.findIndex((e) => e.mail_id === entry.mail_id);
  if (idx >= 0) queue.entries[idx] = entry;
  else queue.entries.unshift(entry);
  writeYamlFile(interpretationQueuePath(), interpretationQueueSchema.parse(queue));
}

export function findMailInterpretation(mailId: string): MailInterpretationResult | undefined {
  return loadMailInterpretationQueue().entries.find((e) => e.mail_id === mailId);
}

async function interpretWithModel(
  model: string,
  userPrompt: string
): Promise<MailInterpretVote | undefined> {
  if (!getLlmApiConfig() && !isLlmMockEnabled()) return undefined;

  const prev = process.env.ORGOS_LLM_MODEL;
  process.env.ORGOS_LLM_MODEL = model;
  try {
    const res = await postLlmChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { responseFormat: { type: "json_object" }, temperature: 0.2 }
    );

    if (!res.ok || !res.message || typeof res.message.content !== "string") return undefined;
    try {
      const raw = JSON.parse(res.message.content) as unknown;
      const parsed = interpretResponseSchema.parse(raw);
      return { model, ...parsed, confidence: parsed.confidence ?? 0.5 };
    } catch {
      return undefined;
    }
  } finally {
    if (prev === undefined) delete process.env.ORGOS_LLM_MODEL;
    else process.env.ORGOS_LLM_MODEL = prev;
  }
}

function buildCeoQuestions(result: MailInterpretationResult): string[] {
  const qs: string[] = [];
  if (result.intent === "return_item") {
    if (result.who_lent === "unclear" || result.who_must_return === "unclear") {
      qs.push("貸借関係に解釈の差があります。誰が誰に貸していますか？");
    }
    qs.push("返却物は手元にありますか？いつ・どの方法で返せますか？");
  }
  if (result.intent === "schedule") {
    qs.push("日程・場所のご希望は？");
  }
  if (result.agreement < 0.67) {
    qs.push("モデル間で解釈が割れています。内容の確認をお願いします。");
  }
  return qs;
}

export async function interpretMailWithEnsemble(
  entry: MailTriageEntry,
  textPreview: string
): Promise<MailInterpretationResult | undefined> {
  if (!isMailInterpretEnsembleEnabled()) return undefined;
  const models = parseInterpretModelsFromEnv();
  if (!models.length) return undefined;

  const userPrompt = [
    `From: ${entry.from}`,
    `Subject: ${entry.subject}`,
    `Received: ${entry.received_at}`,
    "",
    "Body preview (L1):",
    textPreview.slice(0, 500),
  ].join("\n");

  const votes: MailInterpretVote[] = [];
  for (const model of models) {
    const vote = await interpretWithModel(model, userPrompt);
    if (vote) votes.push(vote);
  }
  if (!votes.length) return undefined;

  const intentVote = majorityVote(
    votes.map((v) => v.intent),
    "unknown"
  );
  const lentVote = majorityVote(
    votes.map((v) => v.who_lent ?? "unclear"),
    "unclear"
  );
  const returnVote = majorityVote(
    votes.map((v) => v.who_must_return ?? "unclear"),
    "unclear"
  );
  const actionVote = majorityVoteBoolean(votes.map((v) => v.action_required));

  const winnerIdx = votes.findIndex((v) => v.intent === intentVote.winner);
  const dissent: string[] = [];
  if (intentVote.dissent.length) dissent.push(`intent: ${intentVote.dissent.join(", ")}`);
  if (lentVote.dissent.length) dissent.push(`who_lent: ${lentVote.dissent.join(", ")}`);
  if (returnVote.dissent.length) dissent.push(`who_must_return: ${returnVote.dissent.join(", ")}`);

  const agreement = Math.min(intentVote.agreement, lentVote.agreement, returnVote.agreement);

  const result: MailInterpretationResult = {
    mail_id: entry.id,
    interpreted_at: new Date().toISOString(),
    intent: intentVote.winner,
    who_lent: lentVote.winner,
    who_must_return: returnVote.winner,
    action_required: actionVote.winner,
    summary_l1: pickSummaryFromVotes(votes, winnerIdx >= 0 ? winnerIdx : 0),
    agreement,
    dissent_notes: dissent,
    votes,
    needs_ceo_confirm:
      agreement < 0.67 ||
      lentVote.winner === "unclear" ||
      returnVote.winner === "unclear" ||
      entry.importance === "p0",
    ceo_questions: [],
  };
  result.ceo_questions = buildCeoQuestions(result);
  saveMailInterpretation(result);
  return result;
}

export async function interpretMailFromTriageEntry(
  entry: MailTriageEntry
): Promise<MailInterpretationResult | undefined> {
  const filename = entry.eml_ref.replace(/^records\/executive\/mail-received\//, "");
  const emlPath = join(getMailReceivedDir(), filename);
  if (!existsSync(emlPath)) return undefined;
  const parsed = await parseEmlHeaders(emlPath);
  return interpretMailWithEnsemble(entry, parsed.textPreview);
}
