import { afterEach, describe, expect, it, vi } from "vitest";
import { postLlmChat } from "../src/lib/operator-runtime/llm-chat.js";

describe("llm-chat openai-compatible", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("sends max_tokens on chat completions", async () => {
    process.env.ORGOS_LLM_MOCK = "0";
    process.env.ORGOS_LLM_PROVIDER = "openai-compatible";
    process.env.ORGOS_LLM_API_URL = "http://127.0.0.1:11434/v1";
    process.env.ORGOS_LLM_API_KEY = "ollama";
    process.env.ORGOS_LLM_MODEL = "gemma4:latest";
    process.env.ORGOS_LLM_MAX_TOKENS = "512";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "ready" } }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postLlmChat(
      [{ role: "user", content: "ping" }],
      {
        target: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "ollama",
          model: "gemma4:latest",
        },
      },
    );
    expect(result.ok).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      max_tokens?: number;
    };
    expect(body.max_tokens).toBe(512);
  });

  it("returns a timeout error when the completion never finishes", async () => {
    process.env.ORGOS_LLM_MOCK = "0";
    process.env.ORGOS_LLM_TIMEOUT_MS = "20";

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      }),
    );

    const result = await postLlmChat(
      [{ role: "user", content: "ping" }],
      {
        target: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "ollama",
          model: "gemma4:latest",
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/timeout after 20ms/);
  });
});
