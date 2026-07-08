import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getLlmApiConfig, isLlmApiConfigured, runLlmAsk } from "../src/lib/operator-runtime/llm-api.js";
import { runOperatorAsk } from "../src/lib/operator-runtime/ask.js";

describe("operator runtime llm-api", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_LLM_API_KEY = "test-key";
    process.env.ORGOS_LLM_API_URL = "https://llm.example/v1";
    process.env.ORGOS_LLM_MODEL = "test-model";
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("detects configured LLM API from env", () => {
    expect(isLlmApiConfigured()).toBe(true);
    expect(getLlmApiConfig()?.model).toBe("test-model");
  });

  it("calls chat completions and returns content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: "支払いリスクは低いです。" } }] }),
      })
    );

    const result = await runLlmAsk("system", "来週の支払いは？");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("支払いリスク");
  });

  it("runOperatorAsk prefers llm-api over shell", async () => {
    process.env.ORGOS_LLM_MOCK = "1";
    const result = await runOperatorAsk("質問", "context");
    expect(result.runtime).toBe("llm-api");
    expect(result.reply).toContain("モック");
  });
});
