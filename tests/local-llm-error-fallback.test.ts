import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  applyLocalLlmErrorFallbackToSystem,
  enforceLocalLlmErrorReply,
  formatLocalLlmErrorFallbackBlock,
  isLocalLlmErrorFallbackEnabled,
  isLocalLlmErrorReply,
  parseLocalLlmErrorReply,
} from "../src/lib/operator-runtime/local-llm-error-fallback.js";

describe("local-llm-error-fallback", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("is enabled by default", () => {
    delete process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK;
    expect(isLocalLlmErrorFallbackEnabled()).toBe(true);
  });

  it("can be disabled with ORGOS_LOCAL_LLM_ERROR_FALLBACK=0", () => {
    process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK = "0";
    expect(isLocalLlmErrorFallbackEnabled()).toBe(false);
  });

  describe("parseLocalLlmErrorReply", () => {
    it("accepts a single ERROR line", () => {
      const parsed = parseLocalLlmErrorReply("ERROR: Today context にバーンレートが含まれていない");
      expect(parsed).toEqual({
        isError: true,
        reason: "Today context にバーンレートが含まれていない",
      });
      expect(isLocalLlmErrorReply("ERROR: missing")).toBe(true);
    });

    it("rejects multi-line replies", () => {
      expect(parseLocalLlmErrorReply("ERROR: line1\nline2")).toEqual({ isError: false });
    });

    it("rejects prefixed refusal essays", () => {
      expect(parseLocalLlmErrorReply("申し訳ありません。ERROR: 不足")).toEqual({ isError: false });
    });

    it("rejects empty reason", () => {
      expect(parseLocalLlmErrorReply("ERROR:")).toEqual({ isError: false });
      expect(parseLocalLlmErrorReply("ERROR:   ")).toEqual({ isError: false });
    });
  });

  describe("enforceLocalLlmErrorReply", () => {
    it("coerces 未確認 to ERROR", () => {
      expect(enforceLocalLlmErrorReply("未確認")).toBe("ERROR: 必要な情報が不足しています");
    });

    it("coerces placeholder amounts to ERROR", () => {
      expect(enforceLocalLlmErrorReply("今月の支出は ¥XX,XXX です")).toBe(
        "ERROR: 必要な情報が不足しています",
      );
    });

    it("preserves valid ERROR lines", () => {
      const line = "ERROR: ヘッダが不足しています";
      expect(enforceLocalLlmErrorReply(line)).toBe(line);
    });

    it("preserves grounded short answers", () => {
      const answer = "承認待ちは 1 件です。";
      expect(enforceLocalLlmErrorReply(answer)).toBe(answer);
    });
  });

  describe("applyLocalLlmErrorFallbackToSystem", () => {
    it("appends block for local tier when enabled", () => {
      const system = "base prompt";
      const out = applyLocalLlmErrorFallbackToSystem(system, "local");
      expect(out).toContain(system);
      expect(out).toContain(formatLocalLlmErrorFallbackBlock().trim());
    });

    it("does not append for cloud tier", () => {
      const system = "base prompt";
      expect(applyLocalLlmErrorFallbackToSystem(system, "cloud")).toBe(system);
    });

    it("does not append when disabled", () => {
      process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK = "0";
      const system = "base prompt";
      expect(applyLocalLlmErrorFallbackToSystem(system, "local")).toBe(system);
    });
  });
});

describe("operator runtime local ERROR fallback", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_LLM_API_KEY = "test-key";
    process.env.ORGOS_LLM_STRUCTURED = "1";
    process.env.ORGOS_LLM_TELEMETRY = "0";
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK;
  });

  afterEach(async () => {
    process.env = { ...env };
    const { resetLlmPoolRouterForTests } = await import("../src/lib/llm-pool/router.js");
    resetLlmPoolRouterForTests();
    vi.restoreAllMocks();
  });

  it("skips structured pass when local worker returns ERROR", async () => {
    const { llmWorkersConfigSchema } = await import("../schemas/llm-workers.js");
    const { setLlmPoolConfigOverride } = await import("../src/lib/llm-pool/router.js");
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          {
            id: "local-test",
            label: "local-test",
            tier: "local",
            provider: "openai-compatible",
            base_url: "http://127.0.0.1:11434/v1",
            model: "test-local",
            max_inflight: 1,
            enabled: true,
            api_key_env: "",
          },
        ],
      }),
    );

    let fetchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        fetchCalls += 1;
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "ERROR: Today context に必要な数値がありません",
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
        };
      }),
    );

    const { runLlmWithTools } = await import("../src/lib/operator-runtime/tool-loop.js");
    const result = await runLlmWithTools("system", "バーンレートは？");
    expect(result.ok).toBe(true);
    expect(result.local_error).toBe(true);
    expect(result.content).toBe("ERROR: Today context に必要な数値がありません");
    expect(result.structured).toBeUndefined();
    expect(fetchCalls).toBe(1);
  });
});

describe("mail interpretation local ERROR", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_MAIL_INTERPRET_ENSEMBLE = "1";
    process.env.ORGOS_MAIL_INTERPRET_MODELS = "test-local";
    process.env.ORGOS_LLM_TELEMETRY = "0";
    delete process.env.ORGOS_LLM_MOCK;
  });

  afterEach(async () => {
    process.env = { ...env };
    const { resetLlmPoolRouterForTests } = await import("../src/lib/llm-pool/router.js");
    resetLlmPoolRouterForTests();
    vi.restoreAllMocks();
  });

  it("returns undefined when model emits ERROR line (no fabricated JSON)", async () => {
    const { llmWorkersConfigSchema } = await import("../schemas/llm-workers.js");
    const { setLlmPoolConfigOverride } = await import("../src/lib/llm-pool/router.js");
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          {
            id: "local-mail",
            label: "local-mail",
            tier: "local",
            provider: "openai-compatible",
            base_url: "http://127.0.0.1:11434/v1",
            model: "test-local",
            max_inflight: 1,
            enabled: true,
            api_key_env: "",
          },
        ],
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "ERROR: 本文プレビューが不足しています",
                },
              },
            ],
          }),
      })),
    );

    const { interpretMailWithEnsemble } = await import(
      "../src/lib/correspondence/mail-interpretation.js"
    );
    const result = await interpretMailWithEnsemble(
      {
        id: "MSG-err-001",
        source_message_id: "<t@x>",
        received_at: "2026-08-26T08:00:00+09:00",
        from: "sender@example.com",
        subject: "テスト",
        importance: "p2",
        urgency: "week",
        disposition: "ham",
        routing: "secretary",
        rule_hits: [],
        triaged_at: new Date().toISOString(),
        handoff_status: "pending",
        eml_ref: "records/executive/mail-received/MSG-err-001.eml",
        sender_known: true,
        identification_status: "identified",
      },
      "短いプレビュー",
    );
    expect(result).toBeUndefined();
  });
});
