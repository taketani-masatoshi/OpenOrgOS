import { spawnSync } from "node:child_process";
import { isLlmApiConfigured, type LlmHistoryTurn } from "./llm-api.js";
import { operatorPolicyExcerpt } from "../operator-policy.js";
import { runShellAsk, runShellDispatch, type ShellDispatchResult } from "./shell.js";
import { runLlmWithTools, type LlmToolLoopOptions } from "./tool-loop.js";
import type { OperatorResponse } from "../../../schemas/operator-response.js";
import type { LlmTelemetryEntry } from "./telemetry.js";
import type { OperatorToolContext } from "./tools.js";
import { hasConfiguredLlmWorkers } from "../llm-pool/registry.js";
import type { LlmRouteHint } from "../llm-pool/router.js";
import { getFsGuardAgent, runWithFsGuardAgentAsync } from "../org/fs-guard/index.js";

function isLlmReady(): boolean {
  return isLlmApiConfigured() || hasConfiguredLlmWorkers();
}

export type OperatorRuntimeUsed = "llm-api" | "shell";

export type OperatorHistoryTurn = LlmHistoryTurn;

export interface OperatorAskTelemetry {
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_rounds: number;
  tool_calls: number;
  estimated_cost_usd?: number;
}

export interface OperatorAskResult {
  ok: boolean;
  reply: string;
  stdout: string;
  stderr: string;
  detail: string;
  runtime: OperatorRuntimeUsed;
  shellProfile?: string;
  model?: string;
  /** Worker pool tier when leased; absent for shell / legacy single-env. */
  tier?: "local" | "cloud";
  worker_id?: string;
  setup_required?: boolean;
  /** Local worker emitted intentional ERROR: fallback (ADR 0061). */
  local_error?: boolean;
  structured?: OperatorResponse;
  telemetry?: OperatorAskTelemetry;
}

function commandExists(name: string): boolean {
  const r = spawnSync("which", [name], { encoding: "utf-8" });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

export function resolveShellProfileName(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const fromEnv = process.env.ORGOS_SHELL_PROFILE?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.ORGOS_SHELL_PROFILE_AUTO !== "0" && commandExists("aider")) {
    return "aider";
  }
  return undefined;
}

export function buildOperatorSetupGuide(): string {
  return [
    "## OrgOS Operator LLM が未設定です",
    "",
    "CEO 向けチャット回答には次のいずれかが必要です:",
    "",
    "1. **OpenAI 互換 API**（推奨）",
    "   ```bash",
    "   export OPENAI_API_KEY=sk-...",
    "   # または Ollama: ORGOS_LLM_API_URL=http://127.0.0.1:11434/v1",
    "   orgos chat ask \"来週の支払いリスクは？\"",
    "   ```",
    "",
    "2. **Anthropic ネイティブ API**",
    "   ```bash",
    "   export ANTHROPIC_API_KEY=sk-ant-...",
    "   export ORGOS_LLM_PROVIDER=anthropic",
    "   orgos chat ask \"来週の支払いリスクは？\"",
    "   ```",
    "",
    "3. **aider**（PATH にインストール）",
    "   ```bash",
    "   pip install aider-chat",
    "   orgos operator runtime show",
    "   ```",
    "",
    "4. **runtime.yaml** で cline 等の shell プロファイルを設定",
    "",
    "詳細: docs/quickstart.md §3 · steward/platform/agent/runtime.yaml",
  ].join("\n");
}

function isStubShellReply(reply: string): boolean {
  return (
    reply.includes("OrgOS: set OPENAI_API_KEY") ||
    reply.includes("configure steward/platform/agent/runtime.yaml") ||
    reply.includes("OrgOS shell adapter")
  );
}

function shellToAskResult(result: ShellDispatchResult, profile?: string): OperatorAskResult {
  let reply = (result.stdout || result.detail).trim();
  let setupRequired = false;

  if (!profile && isStubShellReply(reply)) {
    reply = buildOperatorSetupGuide();
    setupRequired = true;
  }

  return {
    ok: setupRequired ? false : result.ok,
    reply,
    stdout: result.stdout,
    stderr: result.stderr,
    detail: reply,
    runtime: "shell",
    shellProfile: profile,
    setup_required: setupRequired,
  };
}

function telemetryFromLoop(t: Omit<LlmTelemetryEntry, "at"> | undefined): OperatorAskTelemetry | undefined {
  if (!t) return undefined;
  return {
    latency_ms: t.latency_ms,
    prompt_tokens: t.prompt_tokens,
    completion_tokens: t.completion_tokens,
    total_tokens: t.total_tokens,
    tool_rounds: t.tool_rounds,
    tool_calls: t.tool_calls,
    estimated_cost_usd: t.estimated_cost_usd,
  };
}

function isExplicitLlmRoute(hint?: LlmRouteHint): boolean {
  return Boolean(hint && (hint.mode !== "auto" || hint.worker_id));
}

async function runLlmOperatorAsk(
  userMessage: string,
  systemContext: string,
  history?: OperatorHistoryTurn[],
  toolContext: OperatorToolContext = {},
  hint?: LlmRouteHint,
  options: LlmToolLoopOptions = {}
): Promise<OperatorAskResult> {
  const llm = await runLlmWithTools(
    systemContext,
    userMessage,
    history,
    toolContext,
    hint,
    options
  );
  return {
    ok: llm.ok,
    reply: llm.content || llm.detail,
    stdout: llm.content,
    stderr: "",
    detail: llm.detail,
    runtime: "llm-api",
    model: llm.model,
    tier: llm.tier,
    worker_id: llm.worker_id,
    structured: llm.structured,
    local_error: llm.local_error,
    telemetry: telemetryFromLoop(llm.telemetry),
  };
}

export async function runOperatorDispatch(
  promptText: string,
  opts?: { workOrderId?: string; profile?: string; agent?: string }
): Promise<OperatorAskResult> {
  const run = async (): Promise<OperatorAskResult> => {
    const profile = resolveShellProfileName(opts?.profile);
    if (profile) {
      const shell = await runShellDispatch(promptText, {
        workOrderId: opts?.workOrderId,
        profile,
        agentId: opts?.agent,
      });
      return shellToAskResult(shell, profile);
    }

    const system = [
      operatorPolicyExcerpt(35),
      "",
      "## Work order dispatch",
      opts?.workOrderId ? `Work order: ${opts.workOrderId}` : "",
      opts?.agent ? `Agent: ${opts.agent}` : "",
      "",
      "Do not write tenant canonical YAML/MD directly.",
      "Propose drafts, then the runtime applies via `orgos guard apply`.",
      "Stay inside Primary Folders for this agent.",
    ]
      .filter(Boolean)
      .join("\n");

    return runOperatorAsk(promptText, system, { preferShell: false });
  };

  if (opts?.agent) {
    return runWithFsGuardAgentAsync(opts.agent, run);
  }
  return run();
}

export async function runOperatorAsk(
  userMessage: string,
  systemContext: string,
  opts?: {
    profile?: string;
    preferShell?: boolean;
    history?: OperatorHistoryTurn[];
    operatorId?: string;
    approverId?: string;
    llmRoute?: LlmRouteHint;
    allowTools?: boolean;
    allowStructuredOutput?: boolean;
  }
): Promise<OperatorAskResult> {
  const profile = resolveShellProfileName(opts?.profile);

  if (!opts?.preferShell && (isLlmReady() || isExplicitLlmRoute(opts?.llmRoute))) {
    const llm = await runLlmOperatorAsk(
      userMessage,
      systemContext,
      opts?.history,
      {
        operatorId: opts?.operatorId,
        approverId: opts?.approverId,
        agentId: getFsGuardAgent(),
      },
      opts?.llmRoute,
      {
        allowTools: opts?.allowTools,
        allowStructuredOutput: opts?.allowStructuredOutput,
      }
    );
    if (llm.ok) return llm;
    // Configured workers / API must not fall through to the "LLM 未設定" shell stub.
    if (isExplicitLlmRoute(opts?.llmRoute) || isLlmReady()) return llm;
  }

  const shell = await runShellAsk(userMessage, systemContext, { profile });
  const ask = shellToAskResult(shell, profile);

  if (!ask.ok && isLlmReady() && !ask.setup_required) {
    ask.detail = `${ask.detail} (LLM API also unavailable or failed)`;
  }

  return ask;
}

export async function* runOperatorAskStream(
  userMessage: string,
  systemContext: string,
  opts?: {
    profile?: string;
    history?: OperatorHistoryTurn[];
    operatorId?: string;
    approverId?: string;
    llmRoute?: LlmRouteHint;
    allowTools?: boolean;
    allowStructuredOutput?: boolean;
  }
): AsyncGenerator<
  { type: "delta"; content: string },
  OperatorAskResult,
  void
> {
  if (isLlmReady() || isExplicitLlmRoute(opts?.llmRoute)) {
    const batch = await runLlmOperatorAsk(
      userMessage,
      systemContext,
      opts?.history,
      {
        operatorId: opts?.operatorId,
        approverId: opts?.approverId,
        agentId: getFsGuardAgent(),
      },
      opts?.llmRoute,
      {
        allowTools: opts?.allowTools,
        allowStructuredOutput: opts?.allowStructuredOutput,
      }
    );
    if (batch.reply) {
      for (const word of batch.reply.split(/(\s+)/)) {
        if (word) yield { type: "delta", content: word };
      }
    }
    return batch;
  }

  const batch = await runOperatorAsk(userMessage, systemContext, opts);
  if (batch.reply) {
    yield { type: "delta", content: batch.reply };
  }
  return batch;
}
