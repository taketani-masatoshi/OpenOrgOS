export interface LlmApiConfig {
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

export function getLlmApiConfig(): LlmApiConfig | null {
  if (isLlmMockEnabled()) {
    return { baseUrl: "mock://local", apiKey: "mock", model: "mock-ceo" };
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

  return { baseUrl, apiKey, model };
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
    "本番では OPENAI_API_KEY または aider を設定してください。",
  ].join("\n");
}

function buildChatMessages(
  systemContext: string,
  userMessage: string,
  history?: LlmHistoryTurn[]
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContext },
  ];
  for (const turn of history ?? []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
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
      detail: "LLM API not configured — set ORGOS_LLM_API_KEY or OPENAI_API_KEY",
      model: "",
    };
  }

  if (isLlmMockEnabled()) {
    const content = mockReply(userMessage);
    return { ok: true, content, detail: content, model: cfg.model };
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: buildChatMessages(systemContext, userMessage, history),
    temperature: 0.3,
  };

  try {
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
        content: "",
        detail: `LLM API ${res.status}: ${raw.slice(0, 500)}`,
        model: cfg.model,
      };
    }

    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: LlmUsage;
    };
    const content = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return {
        ok: false,
        content: "",
        detail: "LLM API returned empty response",
        model: cfg.model,
        usage: parsed.usage,
      };
    }

    return { ok: true, content, detail: content, model: cfg.model, usage: parsed.usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, content: "", detail: `LLM API error: ${message}`, model: cfg.model };
  }
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

  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: buildChatMessages(systemContext, userMessage, history),
    temperature: 0.3,
    stream: true,
  };

  let full = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      return {
        ok: false,
        content: "",
        detail: `LLM API ${res.status}: ${raw.slice(0, 500)}`,
        model: cfg.model,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield delta;
          }
        } catch {
          /* skip malformed chunk */
        }
      }
    }

    const content = full.trim();
    if (!content) {
      return { ok: false, content: "", detail: "LLM API returned empty stream", model: cfg.model };
    }
    return { ok: true, content, detail: content, model: cfg.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, content: full, detail: `LLM API stream error: ${message}`, model: cfg.model };
  }
}
