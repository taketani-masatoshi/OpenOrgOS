import { syncOperatorPolicy, type OperatorPolicyEmit } from "../lib/operator-policy.js";
import { formatOperatorRuntimeConfig } from "../lib/operator-runtime/index.js";
import {
  readRecentLlmTelemetry,
  summarizeLlmTelemetry,
} from "../lib/operator-runtime/telemetry.js";

export function runOperatorSyncPolicy(opts: { emit?: OperatorPolicyEmit }): void {
  const emit = opts.emit ?? "all";
  const paths = syncOperatorPolicy(emit);
  console.log("✓ Operator policy synced");
  if (paths.cursorRulePath) console.log(`  ${paths.cursorRulePath}`);
  if (paths.agentsMdPath) console.log(`  ${paths.agentsMdPath}`);
}

export function runOperatorRuntimeShow(): void {
  console.log(formatOperatorRuntimeConfig());
}

export async function runOperatorRuntimeTest(): Promise<void> {
  const { runShellAsk } = await import("../lib/operator-runtime/shell.js");
  const { operatorPolicyExcerpt } = await import("../lib/operator-policy.js");
  const result = await runShellAsk("Reply with exactly: OrgOS shell adapter ok", operatorPolicyExcerpt(20));
  console.log(result.ok ? "✓ Shell adapter test passed" : "✗ Shell adapter test failed");
  console.log(`  ${result.detail}`);
  if (!result.ok) process.exit(1);
}

export function runOperatorRuntimeStats(opts: { limit?: number; json?: boolean } = {}): void {
  const limit = opts.limit ?? 50;
  const entries = readRecentLlmTelemetry(limit);
  const stats = summarizeLlmTelemetry(entries);

  if (opts.json) {
    console.log(JSON.stringify({ entries: entries.slice(-10), stats }, null, 2));
    return;
  }

  console.log("OrgOS Operator LLM telemetry\n");
  console.log(`  Samples (last ${limit}): ${stats.count}`);
  console.log(`  OK: ${stats.ok_count}`);
  console.log(`  Latency P50: ${stats.latency_p50_ms} ms · P95: ${stats.latency_p95_ms} ms`);
  console.log(`  Total tokens: ${stats.total_tokens}`);
  console.log(`  Tool calls: ${stats.total_tool_calls}`);
  if (stats.estimated_cost_usd != null) {
    console.log(`  Est. cost (window): $${stats.estimated_cost_usd}`);
  }
  if (entries.length === 0) {
    console.log("\n  (no entries — run orgos chat ask with ORGOS_LLM_MOCK=1 or API key)");
  }
}
