import { setTenantEnv } from "../lib/orgos-cli.js";
import {
  buildTodayContext,
  formatTodayContextMarkdown,
} from "../lib/steward-chat/today-context.js";
import {
  appendChatTurn,
  historyForOperator,
  loadChatThread,
} from "../lib/steward-chat/chat-thread.js";
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
    port:
      opts.port ??
      (process.env.STEWARD_CHAT_PORT ? Number(process.env.STEWARD_CHAT_PORT) : undefined),
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

export async function runChatToday(
  opts: { json?: boolean; refresh?: boolean } = {}
): Promise<void> {
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

export async function runChatAsk(message: string, opts: { refresh?: boolean } = {}): Promise<void> {
  if (opts.refresh) {
    runPipelineDaily({ skipValidate: false });
  }
  const ctx = buildTodayContext();
  const thread = loadChatThread(CLI_THREAD_ID, getTenantId());
  const history = historyForOperator(thread);
  const system = [
    operatorPolicyExcerpt(35),
    "",
    "## Today context",
    formatTodayContextMarkdown(ctx),
  ].join("\n");

  const result = await runOperatorAsk(message, system, { history });
  if (result.ok) {
    appendChatTurn(CLI_THREAD_ID, getTenantId(), message, result.reply || result.detail);
    console.log(result.reply || result.detail);
  } else {
    console.error(result.stderr || result.detail);
    process.exit(1);
  }
}
