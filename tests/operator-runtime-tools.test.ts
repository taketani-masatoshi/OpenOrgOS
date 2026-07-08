import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeOperatorTool, listOperatorToolDefinitions } from "../src/lib/operator-runtime/tools.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("operator runtime tools", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.ORGOS_LLM_TOOLS_WRITE = "0";
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("lists read-only tools by default", () => {
    const names = listOperatorToolDefinitions().map((t) => t.function.name);
    expect(names).toContain("operator_today");
    expect(names).toContain("operator_list_approvals");
    expect(names).not.toContain("operator_approve");
  });

  it("includes approve when write enabled", () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const names = listOperatorToolDefinitions().map((t) => t.function.name);
    expect(names).toContain("operator_approve");
  });

  it("executes operator_today", async () => {
    const result = await executeOperatorTool("operator_today", "{}");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Today");
  });
});

describe("operator runtime tool loop", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_LLM_API_KEY = "test-key";
    process.env.ORGOS_LLM_API_URL = "https://llm.example/v1";
    process.env.ORGOS_LLM_MODEL = "test-model";
    process.env.ORGOS_LLM_STRUCTURED = "0";
    delete process.env.ORGOS_LLM_MOCK;
    setTenantId("demo");
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("runs tool_calls loop then returns assistant text", async () => {
    const { runLlmWithTools } = await import("../src/lib/operator-runtime/tool-loop.js");
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "",
                      tool_calls: [
                        {
                          id: "call_1",
                          type: "function",
                          function: {
                            name: "operator_list_approvals",
                            arguments: "{}",
                          },
                        },
                      ],
                    },
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              }),
          };
        }
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: "assistant", content: "承認待ちを確認しました。" } }],
              usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
            }),
        };
      })
    );

    const result = await runLlmWithTools("system", "承認待ちは？");
    expect(result.ok).toBe(true);
    expect(result.tool_calls).toBe(1);
    expect(result.content).toContain("承認");
    expect(result.usage.total_tokens).toBe(45);
  });
});
