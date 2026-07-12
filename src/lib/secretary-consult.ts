import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sendWebhook } from "./webhook.js";
import { currentDate } from "./utils.js";
import { routingQueueDir } from "./routing.js";
import { getTenantId } from "./tenant.js";
import { buildHandoff, writeHandoffFiles } from "./routing.js";
import { pushQueueEvent } from "./queue-db.js";

const ORCHESTRATOR_REF = "@steward/core/orchestrators/secretary_escalation.md";

export interface SecretaryEscalateInput {
  subject: string;
  background?: string;
  questions: string[];
  confidential?: "L0" | "L1" | "L2";
  responseFormat?: string;
  memo?: string;
  date?: string;
}

export function buildSecretaryEscalationMarkdown(input: SecretaryEscalateInput): string {
  const date = input.date ?? currentDate();
  const qs = input.questions.filter(Boolean);
  const questionBlock =
    qs.length > 0 ? qs.map((q, i) => `${i + 1}. ${q}`).join("\n") : "1. （質問を記入）";

  return [
    ORCHESTRATOR_REF,
    "",
    `## エスカレーション入力 ${date}`,
    "",
    `**件名:** ${input.subject}`,
    `**背景:** ${input.background ?? "（Secretary 経由）"}`,
    "**質問:**",
    questionBlock,
    `**機密:** ${input.confidential ?? "L1"}`,
    `**希望回答形式:** ${input.responseFormat ?? "段のアクションリスト"}`,
    input.memo ? `**Secretary メモ:** ${input.memo}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export interface SecretaryEscalateResult {
  markdown: string;
  consultPath: string;
  slug: string;
  webhook?: { sent: boolean; reason: string };
  handoffId?: string;
  handoffPath?: string;
}

export function writeSecretaryConsultFile(
  input: SecretaryEscalateInput,
  opts?: { dryRun?: boolean }
): SecretaryEscalateResult {
  const date = input.date ?? currentDate();
  const slug = slugify(input.subject) || "consult";
  const markdown = buildSecretaryEscalationMarkdown(input);
  const dir = join(routingQueueDir(), "consult");
  mkdirSync(dir, { recursive: true });
  const filename = `CONSULT-${date.replace(/-/g, "")}-${slug}.md`;
  const consultPath = join(dir, filename);

  if (!opts?.dryRun) {
    writeFileSync(consultPath, markdown + "\n", "utf-8");
  }

  return { markdown, consultPath, slug };
}

export async function runSecretaryEscalateAsync(
  input: SecretaryEscalateInput,
  opts?: { webhook?: boolean; dryRun?: boolean }
): Promise<SecretaryEscalateResult> {
  const result = writeSecretaryConsultFile(input, opts);
  if (opts?.webhook && !opts?.dryRun) {
    result.webhook = await sendWebhook("secretary_escalate", {
      tenant: getTenantId(),
      ref: result.slug,
      consult_file: result.consultPath,
    });
  }
  return result;
}

export async function dispatchSecretaryEscalation(
  input: SecretaryEscalateInput,
  opts?: { webhook?: boolean; dryRun?: boolean }
): Promise<SecretaryEscalateResult> {
  const result = await runSecretaryEscalateAsync(input, {
    webhook: opts?.webhook ?? true,
    dryRun: opts?.dryRun,
  });

  if (!opts?.dryRun) {
    const handoff = buildHandoff({
      fromAgent: "secretary",
      toAgent: "executive_steward",
      mode: "suggest",
      text: input.subject,
      notes: `CONSULT: ${result.consultPath}`,
    });
    const { mdPath } = writeHandoffFiles(handoff);
    result.handoffId = handoff.id;
    result.handoffPath = mdPath;

    pushQueueEvent({
      type: "secretary_consult",
      ref: handoff.id,
      tenant: getTenantId(),
      payload: {
        subject: input.subject,
        consult_file: result.consultPath,
        handoff_id: handoff.id,
      },
    });
  }

  return result;
}
