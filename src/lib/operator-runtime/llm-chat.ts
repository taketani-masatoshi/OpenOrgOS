import type { LlmHistoryTurn, LlmUsage } from "./llm-api.js";
import { getLlmApiConfig, isLlmMockEnabled, resolveLlmProvider } from "./llm-api.js";

export type LlmChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface LlmChatCompletionOptions {
  tools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  responseFormat?: Record<string, unknown>;
  temperature?: number;
}

export interface LlmChatCompletionResult {
  ok: boolean;
  message?: LlmChatMessage & { role: "assistant" };
  usage: Partial<LlmUsage>;
  detail: string;
  model: string;
}

function parseOpenAiUsage(raw: unknown): Partial<LlmUsage> {
  if (!raw || typeof raw !== "object") return {};
  const u = raw as Record<string, number>;
  return {
    prompt_tokens: u.prompt_tokens ?? 0,
    completion_tokens: u.completion_tokens ?? 0,
    total_tokens: u.total_tokens ?? 0,
  };
}

function parseAnthropicUsage(raw: unknown): Partial<LlmUsage> {
  if (!raw || typeof raw !== "object") return {};
  const u = raw as { input_tokens?: number; output_tokens?: number };
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: input + output,
  };
}

function splitSystemMessages(messages: LlmChatMessage[]): {
  system: string;
  rest: LlmChatMessage[];
} {
  const systemParts: string[] = [];
  const rest: LlmChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "system" && "content" in m && typeof m.content === "string") {
      systemParts.push(m.content);
    } else {
      rest.push(m);
    }
  }
  return { system: systemParts.join("\n\n"), rest };
}

function toAnthropicMessages(messages: LlmChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "user",
        content: `[tool result ${m.tool_call_id}]\n${m.content}`,
      });
    } else if (m.role === "assistant" && "tool_calls" in m && m.tool_calls?.length) {
      const summary = m.tool_calls
        .map((c) => `${c.function.name}(${c.function.arguments})`)
        .join("; ");
      out.push({
        role: "assistant",
        content: m.content ? `${m.content}\n[tools: ${summary}]` : `[tools: ${summary}]`,
      });
    } else if (m.role === "user" || m.role === "assistant") {
      if (typeof m.content === "string") {
        out.push({ role: m.role, content: m.content });
      }
    }
  }
  return out;
}

async function postOpenAiChat(
  messages: LlmChatMessage[],
  opts?: LlmChatCompletionOptions
): Promise<LlmChatCompletionResult> {
  const cfg = getLlmApiConfig();
  if (!cfg) {
    return { ok: false, usage: {}, detail: "LLM API not configured", model: "" };
  }

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts?.temperature ?? 0.3,
  };
  if (opts?.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  if (opts?.responseFormat) {
    body.response_format = opts.responseFormat;
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      usage: {},
      detail: `LLM API ${res.status}: ${raw.slice(0, 500)}`,
      model: cfg.model,
    };
  }

  const parsed = JSON.parse(raw) as {
    choices?: Array<{ message?: LlmChatMessage & { role: "assistant" } }>;
    usage?: unknown;
  };
  const message = parsed.choices?.[0]?.message;
  if (!message) {
    return {
      ok: false,
      usage: parseOpenAiUsage(parsed.usage),
      detail: "Empty LLM response",
      model: cfg.model,
    };
  }
  return { ok: true, message, usage: parseOpenAiUsage(parsed.usage), detail: "", model: cfg.model };
}

async function postAnthropicChat(
  messages: LlmChatMessage[],
  opts?: LlmChatCompletionOptions
): Promise<LlmChatCompletionResult> {
  const cfg = getLlmApiConfig();
  if (!cfg) {
    return { ok: false, usage: {}, detail: "LLM API not configured", model: "" };
  }

  const { system, rest } = splitSystemMessages(messages);
  const anthropicMessages = toAnthropicMessages(rest);

  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 4096,
    temperature: opts?.temperature ?? 0.3,
    messages: anthropicMessages,
  };
  if (system) body.system = system;

  if (opts?.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      usage: {},
      detail: `Anthropic API ${res.status}: ${raw.slice(0, 500)}`,
      model: cfg.model,
    };
  }

  const parsed = JSON.parse(raw) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: unknown;
  };

  const textBlocks = (parsed.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");

  const message: LlmChatMessage & { role: "assistant" } = {
    role: "assistant",
    content: textBlocks,
  };

  return {
    ok: Boolean(textBlocks),
    message,
    usage: parseAnthropicUsage(parsed.usage),
    detail: textBlocks ? "" : "Anthropic returned empty response",
    model: cfg.model,
  };
}

export async function postLlmChat(
  messages: LlmChatMessage[],
  opts?: LlmChatCompletionOptions
): Promise<LlmChatCompletionResult> {
  if (isLlmMockEnabled()) {
    return {
      ok: true,
      message: { role: "assistant", content: "【mock chat completion】" },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      detail: "",
      model: getLlmApiConfig()?.model ?? "mock",
    };
  }

  return resolveLlmProvider() === "anthropic"
    ? postAnthropicChat(messages, opts)
    : postOpenAiChat(messages, opts);
}

export function historyToMessages(
  systemContext: string,
  userMessage: string,
  history?: LlmHistoryTurn[]
): LlmChatMessage[] {
  const messages: LlmChatMessage[] = [{ role: "system", content: systemContext }];
  for (const turn of history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}
