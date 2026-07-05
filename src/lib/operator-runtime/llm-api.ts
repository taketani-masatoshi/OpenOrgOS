export type LlmProvider = "openai-compatible" | "anthropic";

export interface LlmApiConfig {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LlmAskResult {
  ok: boolean;
  content: string;
  detail: string;
  model: string;
  usage?: LlmUsage;
}

export function isLlmMockEnabled(): boolean {
  return process.env.ORGOS_LLM_MOCK === "1";
}

export function resolveLlmProvider(): LlmProvider {
  const explicit = process.env.ORGOS_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "claude") return "anthropic";
  if (explicit === "openai" || explicit === "openai-compatible") return "openai-compatible";

  const anthropicKey =
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.ORGOS_ANTHROPIC_API_KEY?.trim();
  const openaiKey =
    process.env.ORGOS_LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (anthropicKey && !openaiKey) return "anthropic";
  return "openai-compatible";
}

export function getLlmApiConfig(): LlmApiConfig | null {
  if (isLlmMockEnabled()) {
    return {
      provider: resolveLlmProvider(),
      baseUrl: "mock://local",
      apiKey: "mock",
      model: "mock-ceo",
    };
  }

  const provider = resolveLlmProvider();

  if (provider === "anthropic") {
    const apiKey =
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.ORGOS_ANTHROPIC_API_KEY?.trim() ||
      process.env.ORGOS_LLM_API_KEY?.trim() ||
      "";
    if (!apiKey) return null;
    return {
      provider: "anthropic",
      baseUrl: (
        process.env.ORGOS_LLM_API_URL?.trim() ||
        process.env.ANTHROPIC_BASE_URL?.trim() ||
        "https://api.anthropic.com"
      ).replace(/\/$/, ""),
      apiKey,
      model:
        process.env.ORGOS_LLM_MODEL?.trim() ||
        process.env.ANTHROPIC_MODEL?.trim() ||
        "claude-sonnet-4-20250514",
    };
  }

  const apiKey =
    process.env.ORGOS_LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;

  const baseUrl = (
    process.env.ORGOS_LLM_API_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const model =
    process.env.ORGOS_LLM_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";

  return { provider: "openai-compatible", baseUrl, apiKey, model };
}

export function isLlmApiConfigured(): boolean {
  return getLlmApiConfig() !== null;
}

function mockReply(userMessage: string): string {
  return [
    "【OrgOS モック LLM】",
    "",
    `ご質問「${userMessage.slice(0, 120)}」を受け付けました。`,
    "Today コンテキストに基づき、承認待ち・Wire・inbox を確認してから回答します。",
    "本番では OPENAI_API_KEY / ANTHROPIC_API_KEY または aider を設定してください。",
  ].join("\n");
}

export async function runLlmAsk(
  systemContext: string,
  userMessage: string,
  history?: LlmHistoryTurn[]
): Promise<LlmAskResult> {
  const cfg = getLlmApiConfig();
  if (!cfg) {
    return {
      ok: false,
      content: "",
      detail: "LLM API not configured — set OPENAI_API_KEY or ANTHROPIC_API_KEY",
      model: "",
    };
  }

  if (isLlmMockEnabled()) {
    const content = mockReply(userMessage);
    return { ok: true, content, detail: content, model: cfg.model };
  }

  const { postLlmChat, historyToMessages } = await import("./llm-chat.js");
  const result = await postLlmChat(historyToMessages(systemContext, userMessage, history));
  const content =
    result.message && "content" in result.message && typeof result.message.content === "string"
      ? result.message.content.trim()
      : "";

  if (!result.ok || !content) {
    return {
      ok: false,
      content: "",
      detail: result.detail || "LLM API returned empty response",
      model: result.model || cfg.model,
      usage: result.usage as LlmUsage | undefined,
    };
  }

  return {
    ok: true,
    content,
    detail: content,
    model: result.model || cfg.model,
    usage: result.usage as LlmUsage | undefined,
  };
}

export async function* streamLlmAsk(
  systemContext: string,
  userMessage: string,
  history?: LlmHistoryTurn[]
): AsyncGenerator<string, LlmAskResult, void> {
  const cfg = getLlmApiConfig();
  if (!cfg) {
    return {
      ok: false,
      content: "",
      detail: "LLM API not configured",
      model: "",
    };
  }

  if (isLlmMockEnabled()) {
    const content = mockReply(userMessage);
    for (const word of content.split(/(\s+)/)) {
      if (word) yield word;
    }
    return { ok: true, content, detail: content, model: cfg.model };
  }

  // Non-streaming fallback for anthropic / unified path
  const result = await runLlmAsk(systemContext, userMessage, history);
  if (result.ok && result.content) {
    yield result.content;
  }
  return result;
}
