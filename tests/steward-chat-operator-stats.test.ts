import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appendLlmTelemetry } from "../src/lib/operator-runtime/telemetry.js";
import { buildOperatorStats } from "../src/lib/steward-chat/operator-stats.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat operator stats", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.ORGOS_LLM_TELEMETRY = "1";
    process.env.ORGOS_LLM_TELEMETRY_LOG = joinTmp();
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("aggregates recent telemetry entries", () => {
    appendLlmTelemetry({
      tenant: "demo",
      model: "gpt-test",
      runtime: "llm-api",
      latency_ms: 100,
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      tool_rounds: 0,
      tool_calls: 0,
      structured: false,
      ok: true,
    });
    appendLlmTelemetry({
      tenant: "demo",
      model: "gpt-test",
      runtime: "llm-api",
      latency_ms: 200,
      prompt_tokens: 15,
      completion_tokens: 25,
      total_tokens: 40,
      tool_rounds: 1,
      tool_calls: 1,
      structured: true,
      ok: true,
      estimated_cost_usd: 0.001,
    });

    const result = buildOperatorStats();
    expect(result.stats.count).toBe(2);
    expect(result.stats.total_tokens).toBe(70);
    expect(result.stats.latency_p50_ms).toBeGreaterThan(0);
    expect(result.recent.length).toBeLessThanOrEqual(5);
  });
});

function joinTmp(): string {
  return `${process.cwd()}/data/.orgos/test-llm-telemetry-${Date.now()}.jsonl`;
}
