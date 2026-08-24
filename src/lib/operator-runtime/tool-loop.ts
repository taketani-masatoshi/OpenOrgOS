import {
  operatorResponseJsonSchema,
  operatorResponseSchema,
  formatOperatorResponseMarkdown,
  type OperatorResponse,
} from "../../../schemas/operator-response.js";
import {
  getLlmApiConfig,
  isLlmMockEnabled,
  type LlmApiConfig,
  type LlmHistoryTurn,
  type LlmUsage,
} from "./llm-api.js";
import { postLlmChat, type LlmChatMessage } from "./llm-chat.js";
import {
  executeOperatorTool,
  isOperatorToolsEnabled,
  listOperatorToolDefinitions,
  mockToolCallForMessage,
  type OperatorToolContext,
} from "./tools.js";
import {
  appendLlmTelemetry,
  buildTelemetryEntry,
  estimateLlmCostUsd,
  type LlmTelemetryEntry,
} from "./telemetry.js";
import { withLlmWorker, type LlmWorkerLease } from "../llm-pool/router.js";
import { hasConfiguredLlmWorkers } from "../llm-pool/registry.js";

export interface ToolLoopResult {
  ok: boolean;
  content: string;
  detail: string;
  model: string;
  structured?: OperatorResponse;
  usage: LlmUsage;
  tool_rounds: number;
  tool_calls: number;
  latency_ms: number;
  telemetry?: Omit<LlmTelemetryEntry, "at">;
  worker_id?: string;
  tier?: "local" | "cloud";
  queued_ms?: number;
}

type ChatMessage = LlmChatMessage;

function maxToolRounds(): number {
  const raw = Number(process.env.ORGOS_LLM_TOOLS_MAX_ROUNDS ?? "5");
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

export function isStructuredOutputEnabled(): boolean {
  return process.env.ORGOS_LLM_STRUCTURED !== "0";
}

function emptyUsage(): LlmUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

function mergeUsage(a: LlmUsage, b: Partial<LlmUsage>): LlmUsage {
  return {
    prompt_tokens: a.prompt_tokens + (b.prompt_tokens ?? 0),
    completion_tokens: a.completion_tokens + (b.completion_tokens ?? 0),
    total_tokens: a.total_tokens + (b.total_tokens ?? 0),
  };
}

async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    tools?: ReturnType<typeof listOperatorToolDefinitions>;
    responseFormat?: Record<string, unknown>;
    target?: LlmApiConfig;
  }
): Promise<{
  ok: boolean;
  message?: ChatMessage & { role: "assistant" };
  usage: Partial<LlmUsage>;
  detail: string;
  model: string;
}> {
  const cfg = opts?.target ?? getLlmApiConfig();
  if (!cfg) {
    return { ok: false, usage: {}, detail: "LLM API not configured", model: "" };
  }

  const result = await postLlmChat(messages, {
    tools: opts?.tools,
    responseFormat: opts?.responseFormat,
    target: cfg,
  });

  return {
    ok: result.ok,
    message: result.message as (ChatMessage & { role: "assistant" }) | undefined,
    usage: result.usage,
    detail: result.detail,
    model: result.model,
  };
}

function leaseMeta(lease?: LlmWorkerLease): {
  worker_id?: string;
  tier?: "local" | "cloud";
  queued_ms?: number;
} {
  if (!lease) return {};
  return {
    worker_id: lease.worker.id,
    tier: lease.worker.tier,
    queued_ms: lease.queued_ms,
  };
}

async function runMockToolLoop(
  systemContext: string,
  userMessage: string,
  toolContext: OperatorToolContext,
  lease?: LlmWorkerLease
): Promise<ToolLoopResult> {
  const cfg = lease?.target ?? getLlmApiConfig()!;
  const started = Date.now();
  let toolCalls = 0;
  let toolRounds = 0;
  const meta = leaseMeta(lease);

  if (isOperatorToolsEnabled()) {
    const mockCall = mockToolCallForMessage(userMessage);
    if (mockCall) {
      toolRounds = 1;
      toolCalls = 1;
      const toolResult = await executeOperatorTool(
        mockCall.name,
        mockCall.arguments,
        toolContext
      );
      const content = [
        "【OrgOS モック LLM + ツール】",
        "",
        `ツール \`${mockCall.name}\` を実行しました。`,
        "",
        toolResult.content.slice(0, 800),
        "",
        `ご質問「${userMessage.slice(0, 80)}」への回答です。`,
      ].join("\n");

      let structured: OperatorResponse | undefined;
      if (isStructuredOutputEnabled()) {
        structured = operatorResponseSchema.parse({
          summary: content,
          risks: [],
          actions: [],
          confidence: "medium",
        });
      }

      const usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 };
      const latency_ms = Date.now() - started;
      const telemetry = buildTelemetryEntry({
        model: cfg.model,
        runtime: "llm-api",
        latency_ms,
        ...usage,
        tool_rounds: toolRounds,
        tool_calls: toolCalls,
        structured: Boolean(structured),
        estimated_cost_usd: estimateLlmCostUsd(usage),
        ok: true,
        ...meta,
      });
      appendLlmTelemetry(telemetry);

      return {
        ok: true,
        content: structured ? formatOperatorResponseMarkdown(structured) : content,
        detail: content,
        model: cfg.model,
        structured,
        usage,
        tool_rounds: toolRounds,
        tool_calls: toolCalls,
        latency_ms,
        telemetry,
        ...meta,
      };
    }
  }

  const content = [
    "【OrgOS モック LLM】",
    "",
    `ご質問「${userMessage.slice(0, 120)}」を受け付けました。`,
    systemContext.slice(0, 100),
  ].join("\n");
  const usage = { prompt_tokens: 50, completion_tokens: 40, total_tokens: 90 };
  const latency_ms = Date.now() - started;
  const telemetry = buildTelemetryEntry({
    model: cfg.model,
    runtime: "llm-api",
    latency_ms,
    ...usage,
    tool_rounds: 0,
    tool_calls: 0,
    structured: false,
    estimated_cost_usd: estimateLlmCostUsd(usage),
    ok: true,
    ...meta,
  });
  appendLlmTelemetry(telemetry);
  return {
    ok: true,
    content,
    detail: content,
    model: cfg.model,
    usage,
    tool_rounds: 0,
    tool_calls: 0,
    latency_ms,
    telemetry,
    ...meta,
  };
}

async function runLlmWithToolsOnTarget(
  systemContext: string,
  userMessage: string,
  history: LlmHistoryTurn[] | undefined,
  toolContext: OperatorToolContext,
  lease: LlmWorkerLease
): Promise<ToolLoopResult> {
  const cfg = lease.target;
  const meta = leaseMeta(lease);

  if (isLlmMockEnabled() || cfg.baseUrl.startsWith("mock://")) {
    return runMockToolLoop(systemContext, userMessage, toolContext, lease);
  }

  const started = Date.now();
  let usage = emptyUsage();
  let toolRounds = 0;
  let toolCalls = 0;
  const tools = isOperatorToolsEnabled({ supportsTools: lease.worker.supports_tools })
    ? listOperatorToolDefinitions(toolContext)
    : [];

  const messages: ChatMessage[] = [{ role: "system", content: systemContext }];
  for (const turn of history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: userMessage });

  try {
    for (let round = 0; round < maxToolRounds(); round += 1) {
      const completion = await chatCompletion(messages, {
        tools: tools.length ? tools : undefined,
        target: cfg,
      });
      usage = mergeUsage(usage, completion.usage);
      if (!completion.ok || !completion.message) {
        const latency_ms = Date.now() - started;
        const telemetry = buildTelemetryEntry({
          model: completion.model || cfg.model,
          runtime: "llm-api",
          latency_ms,
          ...usage,
          tool_rounds: toolRounds,
          tool_calls: toolCalls,
          structured: false,
          ok: false,
          error: completion.detail,
          ...meta,
        });
        appendLlmTelemetry(telemetry);
        return {
          ok: false,
          content: "",
          detail: completion.detail,
          model: completion.model || cfg.model,
          usage,
          tool_rounds: toolRounds,
          tool_calls: toolCalls,
          latency_ms,
          telemetry,
          ...meta,
        };
      }

      const msg = completion.message;
      const calls =
        "tool_calls" in msg && msg.tool_calls?.length ? msg.tool_calls : undefined;

      if (calls?.length) {
        toolRounds += 1;
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          tool_calls: calls,
        });
        for (const call of calls) {
          toolCalls += 1;
          const result = await executeOperatorTool(
            call.function.name,
            call.function.arguments,
            toolContext
          );
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result.content.slice(0, 12_000),
          });
        }
        continue;
      }

      const assistantText = (msg.content ?? "").trim();
      if (!assistantText && tools.length) {
        continue;
      }

      if (isStructuredOutputEnabled()) {
        messages.push({
          role: "assistant",
          content: assistantText || "(tool results above)",
        });
        messages.push({
          role: "user",
          content:
            "Based on the conversation and tool results, respond with the structured JSON schema only.",
        });
        const structuredCompletion = await chatCompletion(messages, {
          responseFormat: {
            type: "json_schema",
            json_schema: operatorResponseJsonSchema(),
          },
          target: cfg,
        });
        usage = mergeUsage(usage, structuredCompletion.usage);
        if (structuredCompletion.ok && structuredCompletion.message?.content) {
          try {
            const parsed = operatorResponseSchema.parse(
              JSON.parse(structuredCompletion.message.content)
            );
            const content = formatOperatorResponseMarkdown(parsed);
            const latency_ms = Date.now() - started;
            const telemetry = buildTelemetryEntry({
              model: structuredCompletion.model || cfg.model,
              runtime: "llm-api",
              latency_ms,
              ...usage,
              tool_rounds: toolRounds,
              tool_calls: toolCalls,
              structured: true,
              estimated_cost_usd: estimateLlmCostUsd(usage),
              ok: true,
              ...meta,
            });
            appendLlmTelemetry(telemetry);
            return {
              ok: true,
              content,
              detail: content,
              model: structuredCompletion.model || cfg.model,
              structured: parsed,
              usage,
              tool_rounds: toolRounds,
              tool_calls: toolCalls,
              latency_ms,
              telemetry,
              ...meta,
            };
          } catch {
            /* fall through to plain text */
          }
        }
      }

      if (!assistantText) {
        const latency_ms = Date.now() - started;
        const detail = "LLM returned empty response after tool loop";
        const telemetry = buildTelemetryEntry({
          model: completion.model || cfg.model,
          runtime: "llm-api",
          latency_ms,
          ...usage,
          tool_rounds: toolRounds,
          tool_calls: toolCalls,
          structured: false,
          ok: false,
          error: detail,
          ...meta,
        });
        appendLlmTelemetry(telemetry);
        return {
          ok: false,
          content: "",
          detail,
          model: completion.model || cfg.model,
          usage,
          tool_rounds: toolRounds,
          tool_calls: toolCalls,
          latency_ms,
          telemetry,
          ...meta,
        };
      }

      const latency_ms = Date.now() - started;
      const telemetry = buildTelemetryEntry({
        model: completion.model || cfg.model,
        runtime: "llm-api",
        latency_ms,
        ...usage,
        tool_rounds: toolRounds,
        tool_calls: toolCalls,
        structured: false,
        estimated_cost_usd: estimateLlmCostUsd(usage),
        ok: true,
        ...meta,
      });
      appendLlmTelemetry(telemetry);
      return {
        ok: true,
        content: assistantText,
        detail: assistantText,
        model: completion.model || cfg.model,
        usage,
        tool_rounds: toolRounds,
        tool_calls: toolCalls,
        latency_ms,
        telemetry,
        ...meta,
      };
    }

    const latency_ms = Date.now() - started;
    const detail = `Tool loop exceeded max rounds (${maxToolRounds()})`;
    const telemetry = buildTelemetryEntry({
      model: cfg.model,
      runtime: "llm-api",
      latency_ms,
      ...usage,
      tool_rounds: toolRounds,
      tool_calls: toolCalls,
      structured: false,
      ok: false,
      error: detail,
      ...meta,
    });
    appendLlmTelemetry(telemetry);
    return {
      ok: false,
      content: "",
      detail,
      model: cfg.model,
      usage,
      tool_rounds: toolRounds,
      tool_calls: toolCalls,
      latency_ms,
      telemetry,
      ...meta,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latency_ms = Date.now() - started;
    const telemetry = buildTelemetryEntry({
      model: cfg.model,
      runtime: "llm-api",
      latency_ms,
      ...usage,
      tool_rounds: toolRounds,
      tool_calls: toolCalls,
      structured: false,
      ok: false,
      error: message,
      ...meta,
    });
    appendLlmTelemetry(telemetry);
    return {
      ok: false,
      content: "",
      detail: `LLM tool loop error: ${message}`,
      model: cfg.model,
      usage,
      tool_rounds: toolRounds,
      tool_calls: toolCalls,
      latency_ms,
      telemetry,
      ...meta,
    };
  }
}

export async function runLlmWithTools(
  systemContext: string,
  userMessage: string,
  history?: LlmHistoryTurn[],
  toolContext: OperatorToolContext = {}
): Promise<ToolLoopResult> {
  if (!hasConfiguredLlmWorkers() && !getLlmApiConfig() && !isLlmMockEnabled()) {
    return {
      ok: false,
      content: "",
      detail: "LLM API not configured",
      model: "",
      usage: emptyUsage(),
      tool_rounds: 0,
      tool_calls: 0,
      latency_ms: 0,
    };
  }

  if (isLlmMockEnabled() && !hasConfiguredLlmWorkers()) {
    return runMockToolLoop(systemContext, userMessage, toolContext);
  }

  return withLlmWorker((lease) =>
    runLlmWithToolsOnTarget(systemContext, userMessage, history, toolContext, lease)
  );
}
