import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  appendLlmTelemetry,
  estimateLlmCostUsd,
  readRecentLlmTelemetry,
  summarizeLlmTelemetry,
} from "../src/lib/operator-runtime/telemetry.js";
import { getWorkspaceRoot } from "../src/lib/orgos-paths.js";

describe("operator llm telemetry", () => {
  const env = { ...process.env };
  let logPath: string;

  beforeEach(() => {
    logPath = join(getWorkspaceRoot(), "data", ".orgos", "llm-telemetry-test.jsonl");
    process.env.ORGOS_LLM_TELEMETRY_LOG = logPath;
    if (existsSync(logPath)) rmSync(logPath, { force: true });
  });

  afterEach(() => {
    process.env = { ...env };
    if (existsSync(logPath)) rmSync(logPath, { force: true });
  });

  it("estimates cost from price env", () => {
    process.env.ORGOS_LLM_PRICE_INPUT = "3";
    process.env.ORGOS_LLM_PRICE_OUTPUT = "15";
    const cost = estimateLlmCostUsd({ prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 });
    expect(cost).toBe(3);
  });

  it("appends and summarizes telemetry entries", () => {
    appendLlmTelemetry({
      tenant: "demo",
      model: "test",
      runtime: "llm-api",
      latency_ms: 100,
      prompt_tokens: 50,
      completion_tokens: 25,
      total_tokens: 75,
      tool_rounds: 1,
      tool_calls: 1,
      structured: false,
      ok: true,
    });
    appendLlmTelemetry({
      tenant: "demo",
      model: "test",
      runtime: "llm-api",
      latency_ms: 300,
      prompt_tokens: 80,
      completion_tokens: 40,
      total_tokens: 120,
      tool_rounds: 0,
      tool_calls: 0,
      structured: true,
      ok: true,
    });

    const entries = readRecentLlmTelemetry(10);
    expect(entries.length).toBe(2);
    const stats = summarizeLlmTelemetry(entries);
    expect(stats.total_tokens).toBe(195);
    expect(stats.total_tool_calls).toBe(1);
    expect(readFileSync(logPath, "utf-8").split("\n").filter(Boolean).length).toBe(2);
  });
});
