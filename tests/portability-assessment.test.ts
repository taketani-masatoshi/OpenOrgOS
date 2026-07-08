import { describe, it, expect, afterEach, vi } from "vitest";
import { computePortabilityAssessment } from "../src/lib/agent-portability.js";
import { getLlmApiConfig, resolveLlmProvider } from "../src/lib/operator-runtime/llm-api.js";
import { postLlmChat, historyToMessages } from "../src/lib/operator-runtime/llm-chat.js";

describe("portability assessment", () => {
  it("all dimensions score ≥90%", () => {
    const report = computePortabilityAssessment();
    expect(report.scores.definition_portability).toBeGreaterThanOrEqual(90);
    expect(report.scores.execution_automation).toBeGreaterThanOrEqual(90);
    expect(report.scores.terminology_ux).toBeGreaterThanOrEqual(90);
    expect(report.scores.anthropic_native).toBeGreaterThanOrEqual(90);
    expect(report.target_met).toBe(true);
    expect(report.overall).toBeGreaterThanOrEqual(90);
  });
});

describe("anthropic llm provider", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("resolves anthropic when ANTHROPIC_API_KEY set", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ORGOS_LLM_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ORGOS_LLM_PROVIDER = "anthropic";
    expect(resolveLlmProvider()).toBe("anthropic");
    expect(getLlmApiConfig()?.provider).toBe("anthropic");
  });

  it("postLlmChat calls anthropic messages endpoint", async () => {
    process.env.ORGOS_LLM_MOCK = "0";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.ORGOS_LLM_PROVIDER = "anthropic";
    process.env.ORGOS_LLM_MODEL = "claude-test";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            content: [{ type: "text", text: "Anthropic OK" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
      })
    );

    const result = await postLlmChat(historyToMessages("system", "hello"));
    expect(result.ok).toBe(true);
    expect(result.message?.content).toContain("Anthropic OK");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/v1/messages");
  });
});
