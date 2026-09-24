import type { AiaRunRecord } from "../../../schemas/aia-runtime.js";
import { loadLlmWorkersConfig } from "../llm-pool/registry.js";
import { getWorkerInflight } from "../llm-pool/stats.js";
import { getCatalogAgent } from "../agent-catalog.js";
import { loadModuleManifest, resolveModuleSecurity } from "../modules.js";
import { loadAiaRuntimeConfig } from "./runtime-config.js";

export function llmPoolHasCapacity(): boolean {
  const config = loadLlmWorkersConfig();
  let max = 0;
  let inflight = 0;
  for (const worker of config.workers) {
    if (!worker.enabled) continue;
    max += worker.max_inflight;
    inflight += getWorkerInflight(worker.id);
  }
  return max === 0 || inflight < max;
}

export function resolveModuleIdForAgent(agentId: string): string | undefined {
  const entry = getCatalogAgent(agentId);
  const binds = entry?.binds_modules;
  if (Array.isArray(binds) && binds.length > 0) return binds[0];
  if (loadModuleManifest(agentId)) return agentId;
  return undefined;
}

export function resolveConcurrentJobsLimit(agentId: string): number {
  const moduleId = resolveModuleIdForAgent(agentId);
  if (!moduleId) {
    return loadAiaRuntimeConfig().max_concurrent_aia;
  }
  const manifest = loadModuleManifest(moduleId);
  const explicit = manifest?.security?.limits?.concurrent_jobs;
  if (explicit && explicit > 0) return explicit;
  const trust = resolveModuleSecurity(moduleId).trust_class;
  if (trust === "third_party") return 1;
  return loadAiaRuntimeConfig().max_concurrent_aia;
}

export type AiaAdmissionRequest = {
  run_id: string;
  agent_id: string;
  module_id?: string;
  work_order_id?: string;
};

export type AiaAdmissionResult =
  | { admitted: true; run: AiaRunRecord; workspace_relpath: string }
  | { admitted: false; reason: string; queued?: boolean };
