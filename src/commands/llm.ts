import { setTenantId } from "../lib/tenant.js";
import {
  initLlmWorkersConfig,
  loadLlmWorkersConfig,
  llmWorkersPath,
  isWorkerKeyConfigured,
} from "../lib/llm-pool/registry.js";
import { probeWorker } from "../lib/llm-pool/health.js";
import { snapshotWorkerStats } from "../lib/llm-pool/stats.js";

function withTenant(tenant: string | undefined): void {
  if (tenant) setTenantId(tenant);
}

export function runLlmWorkersInit(opts: {
  tenant?: string;
  force?: boolean;
}): void {
  withTenant(opts.tenant);
  const path = initLlmWorkersConfig({ force: opts.force });
  console.log(`Wrote ${path}`);
}

export function runLlmWorkersList(opts: {
  tenant?: string;
  json?: boolean;
}): void {
  withTenant(opts.tenant);
  const config = loadLlmWorkersConfig();
  const stats = snapshotWorkerStats(config.workers);
  const byId = new Map(stats.map((s) => [s.worker_id, s]));
  const rows = config.workers.map((w) => {
    const s = byId.get(w.id);
    return {
      id: w.id,
      label: w.label,
      tier: w.tier,
      provider: w.provider,
      base_url: w.base_url,
      model: w.model,
      max_inflight: w.max_inflight,
      enabled: w.enabled,
      api_key_env: w.api_key_env,
      key_configured: isWorkerKeyConfigured(w),
      healthy: s?.healthy ?? true,
      inflight: s?.inflight ?? 0,
      avg_latency_ms: s?.avg_latency_ms ?? 0,
    };
  });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          path: llmWorkersPath(),
          queue: config.queue,
          workers: rows,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`Config: ${llmWorkersPath()}`);
  console.log(
    `Queue: max=${config.queue.max_queue} overflow=${config.queue.cloud_overflow.enabled}`,
  );
  for (const r of rows) {
    const flag = r.enabled ? (r.healthy ? "ok" : "unhealthy") : "off";
    console.log(
      `  [${flag}] ${r.id}  ${r.tier}/${r.provider}  ${r.model}  inflight=${r.inflight}/${r.max_inflight}  key=${r.key_configured ? "yes" : "no"}`,
    );
  }
}

export async function runLlmWorkersProbe(opts: {
  tenant?: string;
  id?: string;
}): Promise<void> {
  withTenant(opts.tenant);
  const config = loadLlmWorkersConfig();
  const targets = opts.id
    ? config.workers.filter((w) => w.id === opts.id)
    : config.workers.filter((w) => w.enabled);
  if (targets.length === 0) {
    console.error(opts.id ? `Worker not found: ${opts.id}` : "No enabled workers");
    process.exitCode = 1;
    return;
  }
  for (const w of targets) {
    const result = await probeWorker(w);
    console.log(
      `${w.id}: ${result.ok ? "OK" : "FAIL"} (${result.latency_ms}ms) ${result.detail}`,
    );
    if (!result.ok) process.exitCode = 1;
  }
}
