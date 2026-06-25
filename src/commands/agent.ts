import {
  buildDispatchManifest,
  formatDispatchPlan,
  runDispatch,
  writeDispatchManifest,
  type DispatchRuntime,
} from "../lib/agent-dispatch.js";
import { runCloudWatch, formatCloudConfig } from "../lib/agent-cloud-watch.js";

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
