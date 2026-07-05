import { syncOperatorPolicy, type OperatorPolicyEmit } from "../lib/operator-policy.js";
import {
  computePortabilityAssessment,
  exportPortableAgents,
  formatPortabilityAssessment,
  type OperatorExportEmit,
} from "../lib/agent-portability.js";
import { formatOperatorRuntimeConfig } from "../lib/operator-runtime/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../lib/tenant.js";
import {
  readRecentLlmTelemetry,
  summarizeLlmTelemetry,
} from "../lib/operator-runtime/telemetry.js";

export function runOperatorSyncPolicy(opts: { emit?: OperatorPolicyEmit }): void {
  const emit = opts.emit ?? "all";
  const paths = syncOperatorPolicy(emit);
  if (emit === "all") {
    exportPortableAgents({ all: true, emit: "all" });
    console.log("✓ Portable agent packs refreshed");
  }
  console.log("✓ Operator policy synced");
  if (paths.cursorRulePath) console.log(`  ${paths.cursorRulePath}`);
  if (paths.agentsMdPath) console.log(`  ${paths.agentsMdPath}`);
  if (paths.devGuideRulePath) console.log(`  ${paths.devGuideRulePath}`);
}

export function runOperatorExport(opts: {
  agent?: string;
  all?: boolean;
  emit?: OperatorExportEmit;
  fullPolicy?: boolean;
}): void {
  const result = exportPortableAgents(opts);
  console.log("✓ Portable agent export");
  if (result.indexPath) console.log(`  ${result.indexPath}`);
  for (const p of result.packs) console.log(`  ${p}`);
  for (const p of result.mcpPaths) console.log(`  ${p}`);
}

export function runOperatorPortability(opts: { json?: boolean; write?: boolean } = {}): void {
  const report = computePortabilityAssessment();
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPortabilityAssessment(report));
  }
  if (opts.write) {
    const dir = join(ROOT_DIR, "steward", "platform", "agent");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "PORTABILITY-ASSESSMENT.md");
    writeFileSync(path, formatPortabilityAssessment(report), "utf-8");
    console.log(`\n✓ ${path}`);
  }
  if (!report.target_met) process.exit(1);
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
