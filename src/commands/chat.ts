import { setTenantEnv } from "../lib/orgos-cli.js";
import { buildTodayContext, formatTodayContextMarkdown } from "../lib/steward-chat/today-context.js";
import {
  appendChatTurn,
  historyForOperator,
  loadChatThread,
} from "../lib/steward-chat/chat-thread.js";
import {
  chatMetaFromLlmResult,
  formatAnswerMemoryBlock,
  recentUserQueryHashes,
  reindexAnswerMemory,
  rememberAnswer,
  retrieveAnswerMemory,
} from "../lib/steward-chat/answer-memory.js";
import { formatChatGroundingBlock } from "../lib/steward-chat/chat-grounding.js";
import { startStewardChatServer } from "../lib/steward-chat/server.js";
import { formatProdAuthWarnings, runProdAuthChecks } from "../lib/console-auth/prod-checklist.js";
import { operatorPolicyExcerpt } from "../lib/operator-policy.js";
import { runOperatorAsk } from "../lib/operator-runtime/ask.js";
import { getTenantId } from "../lib/tenant.js";
import { runPipelineDaily } from "./pipeline.js";

const CLI_THREAD_ID = "cli-local";

export interface ChatStartOptions {
  host?: string;
  port?: number;
  tenant?: string;
}

export async function runChatStart(opts: ChatStartOptions = {}): Promise<void> {
  if (opts.tenant) setTenantEnv(opts.tenant);

  const warnings = formatProdAuthWarnings(runProdAuthChecks("chat"));
  if (warnings.length) {
    console.warn("⚠ Steward Chat auth warnings:");
    for (const w of warnings) console.warn(`  · ${w}`);
  }

  const handle = startStewardChatServer({
    host: opts.host ?? process.env.STEWARD_CHAT_HOST?.trim(),
    port: opts.port ?? (process.env.STEWARD_CHAT_PORT ? Number(process.env.STEWARD_CHAT_PORT) : undefined),
  });
  console.log(`✓ Steward Chat BFF · ${handle.url}`);
  console.log("  GET  /chat/v1/today");
  console.log("  POST /chat/v1/message");
  console.log("  POST /chat/v1/message/stream");
  console.log("  POST /chat/v1/wire/flush");
  console.log("  POST /chat/v1/auth/login  (passkey — WIRE_CONSOLE_DEV_PASSKEY)");
  if (process.env.STEWARD_CHAT_AUTH === "0") {
    console.log("  ⚠ STEWARD_CHAT_AUTH=0 — auth disabled");
  }
  console.log("  Press Ctrl+C to stop");

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      handle.close();
      resolve();
    });
  });
}

export async function runChatToday(opts: { json?: boolean; refresh?: boolean } = {}): Promise<void> {
  if (opts.refresh) {
    await runPipelineDaily({ skipValidate: false });
  }
  const ctx = buildTodayContext();
  if (opts.json) {
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }
  console.log(formatTodayContextMarkdown(ctx));
}

export async function runChatAsk(
  message: string,
  opts: { refresh?: boolean } = {}
): Promise<void> {
  if (opts.refresh) {
    runPipelineDaily({ skipValidate: false });
  }
  const ctx = buildTodayContext();
  const thread = loadChatThread(CLI_THREAD_ID, getTenantId());
  const history = historyForOperator(thread);
  const memoryHits = retrieveAnswerMemory(message, {
    excludeQueryHashes: recentUserQueryHashes(thread),
  });
  const system = [
    operatorPolicyExcerpt(35),
    formatChatGroundingBlock(),
    formatAnswerMemoryBlock(memoryHits),
    "",
    "## Today context",
    formatTodayContextMarkdown(ctx),
  ].join("\n");

  const result = await runOperatorAsk(message, system, { history });
  if (result.ok) {
    const reply = result.reply || result.detail;
    const meta = chatMetaFromLlmResult(result);
    appendChatTurn(CLI_THREAD_ID, getTenantId(), message, reply, meta);
    if (meta.source && meta.source !== "deterministic") {
      rememberAnswer({
        query: message,
        answer: reply,
        source: meta.source,
        model: meta.model,
        worker_id: meta.worker_id,
      });
    }
    console.log(reply);
  } else {
    console.error(result.stderr || result.detail);
    process.exit(1);
  }
}

export async function runChatMemoryReindex(opts: { json?: boolean } = {}): Promise<void> {
  const result = reindexAnswerMemory(getTenantId());
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }
  console.log(
    `✓ Answer memory reindex · threads=${result.threads} pairs=${result.pairs} indexed=${result.indexed}`
  );
}

export async function runChatFaqBuild(opts: { json?: boolean } = {}): Promise<void> {
  const { buildFaqIndex } = await import("../lib/steward-chat/faq-index.js");
  const result = buildFaqIndex();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }
  console.log(`✓ FAQ index built · scanned=${result.indexed} entries=${result.entries}`);
}
