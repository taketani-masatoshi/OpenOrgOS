import {
  buildDispatchManifest,
  formatDispatchPlan,
  runDispatch,
  writeDispatchManifest,
  type DispatchRuntime,
} from "../lib/agent-dispatch.js";
import { runCloudWatch, formatCloudConfig } from "../lib/agent-cloud-watch.js";
import { formatAgentImplementationPrompt, regenerateWorkOrderPrompts } from "../lib/escalate.js";
import { loadHandoff } from "../lib/routing.js";
import { runOperatorDispatch } from "../lib/operator-runtime/ask.js";
import type { AgentId } from "../../schemas/classification.js";
import {
  computeAgentReadiness,
  computeAllAgentReadiness,
  formatAgentReadinessReport,
} from "../lib/agent-readiness.js";
import { runAgentPulse, runAllAgentPulses, runExtensionAgentPulses } from "../lib/agent-pulse.js";
import { setTenantId } from "../lib/tenant.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";

export interface AgentDispatchPlanOptions {
  id: string;
  parallel?: number;
  runtime?: DispatchRuntime;
  json?: boolean;
}

export async function runAgentDispatchPlan(opts: AgentDispatchPlanOptions): Promise<void> {
  const manifest = buildDispatchManifest(opts.id, opts.parallel ?? 3, opts.runtime);
  if (opts.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(formatDispatchPlan(manifest));
}

export interface AgentDispatchRunOptions {
  id: string;
  parallel?: number;
  dryRun?: boolean;
  runtime?: DispatchRuntime;
  json?: boolean;
}

export async function runAgentDispatchRun(opts: AgentDispatchRunOptions): Promise<void> {
  requireCliOperator({ permission: "agent:dispatch", command: "agent dispatch run" });
  if (opts.dryRun) {
    const manifest = buildDispatchManifest(opts.id, opts.parallel ?? 3, opts.runtime);
    const path = writeDispatchManifest(manifest);
    console.log(formatDispatchPlan(manifest));
    console.log(`\n✓ ${path}`);
    return;
  }

  const result = await runDispatch(opts.id, { parallel: opts.parallel, runtime: opts.runtime });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(formatDispatchPlan(result.manifest));
  if (result.manifestPath) console.log(`\n✓ ${result.manifestPath}`);
  console.log(`Mode: ${result.mode}`);
  for (const r of result.results) {
    console.log(`  ${r.work_order_id}: ${r.ok ? "✓" : "✗"} ${r.detail}`);
  }
}

export interface AgentImplementOptions {
  id: string;
  profile?: string;
  json?: boolean;
}

/** Tool-neutral work order execution — LLM API · shell · manifest */
export async function runAgentImplement(opts: AgentImplementOptions): Promise<void> {
  requireCliOperator({ permission: "agent:dispatch", command: "agent implement" });
  regenerateWorkOrderPrompts(opts.id);
  const handoff = loadHandoff(opts.id);
  const prompt = formatAgentImplementationPrompt(handoff);
  const result = await runOperatorDispatch(prompt, {
    workOrderId: opts.id,
    agent: handoff.to_agent,
    profile: opts.profile,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Work order: ${opts.id} · agent: ${handoff.to_agent}`);
  console.log(
    `Runtime: ${result.runtime}${result.shellProfile ? ` (${result.shellProfile})` : ""}`
  );
  console.log(result.ok ? "✓" : "✗", result.reply.slice(0, 500) || result.detail);
  if (!result.ok) process.exit(1);
}

export interface AgentCloudWatchOptions {
  interval?: number;
  once?: boolean;
  parallel?: number;
}

export async function runAgentCloudWatch(opts: AgentCloudWatchOptions): Promise<void> {
  console.log(formatCloudConfig());
  const cycles = await runCloudWatch({
    intervalMs: opts.interval,
    once: opts.once,
    parallel: opts.parallel,
  });
  console.log(`✓ watch cycles: ${cycles}`);
}

export function runAgentCloudConfig(): void {
  console.log(formatCloudConfig());
}

export interface AgentReadinessOptions {
  tenant?: string;
  agent?: string;
  json?: boolean;
  min?: number;
}

export function runAgentReadiness(opts: AgentReadinessOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const results = opts.agent
    ? [computeAgentReadiness(opts.agent as AgentId)]
    : computeAllAgentReadiness();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatAgentReadinessReport(results));
  }

  const min = opts.min ?? 0;
  const below = results.filter((r) => r.pct < min);
  if (min > 0 && below.length) process.exit(1);
}

export interface AgentPulseOptions {
  tenant?: string;
  agent?: string;
  all?: boolean;
  extensions?: boolean;
  suffix?: string;
}

export function runAgentPulseCommand(opts: AgentPulseOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);

  if (opts.all) {
    const paths = runAllAgentPulses({ suffix: opts.suffix ?? "pulse" });
    console.log(`✓ ${paths.length} pulse summaries written`);
    return;
  }

  if (opts.extensions) {
    const paths = runExtensionAgentPulses({ suffix: opts.suffix ?? "dashboard-sync" });
    console.log(`✓ ${paths.length} extension pulse summaries written`);
    return;
  }

  if (!opts.agent) {
    console.error("Usage: orgos agent pulse --agent <id> | --all | --extensions");
    process.exit(1);
  }

  const path = runAgentPulse(opts.agent as AgentId, { suffix: opts.suffix ?? "pulse" });
  console.log(`✓ ${path}`);
}
