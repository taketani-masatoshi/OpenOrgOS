import { describe, expect, it } from "vitest";
import {
  formatOperatorResponseMarkdown,
  operatorResponseSchema,
} from "../schemas/operator-response.js";

describe("operator structured response", () => {
  it("parses valid operator response", () => {
    const parsed = operatorResponseSchema.parse({
      summary: "来週のキャッシュフローは安定しています。",
      risks: ["Wire 承認 1 件が滞留"],
      actions: [{ priority: "p1", label: "NOTICE-001 を承認", ref_id: "NOTICE-001" }],
      confidence: "high",
    });
    expect(parsed.actions[0]?.ref_id).toBe("NOTICE-001");
  });

  it("formats markdown for CEO reply", () => {
    const md = formatOperatorResponseMarkdown(
      operatorResponseSchema.parse({
        summary: "概要",
        risks: ["リスクA"],
        actions: [{ priority: "p0", label: "即時確認" }],
        confidence: "medium",
      })
    );
    expect(md).toContain("## リスク");
    expect(md).toContain("**[P0]**");
    expect(md).toContain("信頼度");
  });
});

describe("operator runtime structured mock", () => {
  it("returns structured field when mock + structured enabled", async () => {
    process.env.ORGOS_LLM_MOCK = "1";
    process.env.ORGOS_LLM_STRUCTURED = "1";
    process.env.ORGOS_LLM_TELEMETRY = "0";
    const { runOperatorAsk } = await import("../src/lib/operator-runtime/ask.js");
    const result = await runOperatorAsk("承認待ちは？", "context");
    expect(result.ok).toBe(true);
    expect(result.structured?.summary).toBeTruthy();
    expect(result.telemetry?.tool_calls).toBeGreaterThanOrEqual(1);
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_LLM_STRUCTURED;
    delete process.env.ORGOS_LLM_TELEMETRY;
  });
});
