import {
  readRecentLlmTelemetry,
  summarizeLlmTelemetry,
  type LlmTelemetryEntry,
  type LlmTelemetryStats,
} from "../operator-runtime/telemetry.js";

export interface OperatorStatsRecentEntry {
  at: string;
  model: string;
  latency_ms: number;
  total_tokens: number;
  tool_calls: number;
  ok: boolean;
  estimated_cost_usd?: number;
}

export interface OperatorStatsResponse {
  stats: LlmTelemetryStats;
  recent: OperatorStatsRecentEntry[];
}

function toRecentEntry(e: LlmTelemetryEntry): OperatorStatsRecentEntry {
  return {
    at: e.at,
    model: e.model,
    latency_ms: e.latency_ms,
    total_tokens: e.total_tokens,
    tool_calls: e.tool_calls,
    ok: e.ok,
    estimated_cost_usd: e.estimated_cost_usd,
  };
}

export function buildOperatorStats(limit = 50): OperatorStatsResponse {
  const entries = readRecentLlmTelemetry(limit);
  return {
    stats: summarizeLlmTelemetry(entries),
    recent: entries
      .slice(-5)
      .reverse()
      .map(toRecentEntry),
  };
}
