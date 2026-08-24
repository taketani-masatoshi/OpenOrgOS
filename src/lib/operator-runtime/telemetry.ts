import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getTenantId } from "../tenant.js";

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LlmTelemetryEntry {
  at: string;
  tenant: string;
  model: string;
  runtime: "llm-api";
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_rounds: number;
  tool_calls: number;
  structured: boolean;
  estimated_cost_usd?: number;
  ok: boolean;
  error?: string;
  worker_id?: string;
  tier?: "local" | "cloud";
  queued_ms?: number;
}

export function isLlmTelemetryEnabled(): boolean {
  return process.env.ORGOS_LLM_TELEMETRY !== "0";
}

function telemetryLogPath(): string {
  const fromEnv = process.env.ORGOS_LLM_TELEMETRY_LOG?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), "data", ".orgos", "llm-telemetry.jsonl");
}

export function estimateLlmCostUsd(usage: LlmUsage): number | undefined {
  const priceIn = Number(process.env.ORGOS_LLM_PRICE_INPUT ?? "");
  const priceOut = Number(process.env.ORGOS_LLM_PRICE_OUTPUT ?? "");
  if (!Number.isFinite(priceIn) || !Number.isFinite(priceOut)) return undefined;
  const inCost = (usage.prompt_tokens / 1_000_000) * priceIn;
  const outCost = (usage.completion_tokens / 1_000_000) * priceOut;
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}

export function appendLlmTelemetry(entry: Omit<LlmTelemetryEntry, "at">): void {
  if (!isLlmTelemetryEnabled()) return;
  const path = telemetryLogPath();
  mkdirSync(dirname(path), { recursive: true });
  const line: LlmTelemetryEntry = { at: new Date().toISOString(), ...entry };
  appendFileSync(path, `${JSON.stringify(line)}\n`, "utf-8");
}

export function readRecentLlmTelemetry(limit = 100): LlmTelemetryEntry[] {
  const path = telemetryLogPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  const slice = lines.slice(-limit);
  const entries: LlmTelemetryEntry[] = [];
  for (const line of slice) {
    try {
      entries.push(JSON.parse(line) as LlmTelemetryEntry);
    } catch {
      /* skip */
    }
  }
  return entries;
}

export interface LlmTelemetryStats {
  count: number;
  ok_count: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  total_tokens: number;
  total_tool_calls: number;
  estimated_cost_usd?: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
}

export function summarizeLlmTelemetry(entries: LlmTelemetryEntry[]): LlmTelemetryStats {
  if (entries.length === 0) {
    return {
      count: 0,
      ok_count: 0,
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      total_tokens: 0,
      total_tool_calls: 0,
    };
  }
  const latencies = entries.map((e) => e.latency_ms).sort((a, b) => a - b);
  let costSum = 0;
  let costCount = 0;
  for (const e of entries) {
    if (e.estimated_cost_usd != null) {
      costSum += e.estimated_cost_usd;
      costCount += 1;
    }
  }
  return {
    count: entries.length,
    ok_count: entries.filter((e) => e.ok).length,
    latency_p50_ms: percentile(latencies, 50),
    latency_p95_ms: percentile(latencies, 95),
    total_tokens: entries.reduce((s, e) => s + e.total_tokens, 0),
    total_tool_calls: entries.reduce((s, e) => s + e.tool_calls, 0),
    estimated_cost_usd: costCount > 0 ? Math.round(costSum * 1_000_000) / 1_000_000 : undefined,
  };
}

export function buildTelemetryEntry(
  partial: Omit<LlmTelemetryEntry, "at" | "tenant">
): Omit<LlmTelemetryEntry, "at"> {
  return { tenant: getTenantId(), ...partial };
}
