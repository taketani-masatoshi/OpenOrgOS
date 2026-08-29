import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  aiaRuntimeFileSchema,
  type AiaRunRecord,
  type AiaRunState,
  type AiaRuntimeFile,
} from "../../../schemas/aia-runtime.js";
import { loadLlmWorkersConfig } from "../llm-pool/registry.js";
import { getWorkerInflight } from "../llm-pool/stats.js";
import { getCatalogAgent } from "../agent-catalog.js";
import { loadModuleManifest, resolveModuleSecurity } from "../modules.js";
import { tenantDataPath } from "../tenant.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import {
  hydrateAiaQueueState,
  persistAiaQueueState,
  saveAiaQueueFile,
} from "./queue-store.js";

const DEFAULT_RUNTIME: AiaRuntimeFile = aiaRuntimeFileSchema.parse({
  schema: "orgos.aia.runtime.v1",
});

export function aiaRuntimeConfigPath(): string {
  return tenantDataPath("org", "aia-runtime.yaml");
}

export function loadAiaRuntimeConfig(): AiaRuntimeFile {
  const path = aiaRuntimeConfigPath();
  if (!existsSync(path)) return DEFAULT_RUNTIME;
  return readYamlFile(path, aiaRuntimeFileSchema);
}

export function saveAiaRuntimeConfig(config: AiaRuntimeFile): string {
  const path = aiaRuntimeConfigPath();
  writeYamlFile(path, config);
  return path;
}

function llmPoolHasCapacity(): boolean {
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

export class AiaScheduler {
  private readonly config: AiaRuntimeFile;
  private readonly runs = new Map<string, AiaRunRecord>();
  private readonly queue: string[] = [];

  constructor(config?: AiaRuntimeFile, opts?: { hydrate?: boolean }) {
    this.config = config ?? loadAiaRuntimeConfig();
    if (opts?.hydrate !== false) {
      const hydrated = hydrateAiaQueueState();
      for (const [id, run] of hydrated.runs) {
        this.runs.set(id, run);
      }
      this.queue.push(...hydrated.queueOrder);
    }
  }

  private persistQueue(): void {
    persistAiaQueueState(this.runs, this.queue);
  }

  get runtimeConfig(): AiaRuntimeFile {
    return this.config;
  }

  private activeCount(): number {
    return [...this.runs.values()].filter((r) =>
      ["admitted", "running", "merging"].includes(r.state),
    ).length;
  }

  get runningCount(): number {
    return this.activeCount();
  }

  countRunningForModule(moduleId: string): number {
    return [...this.runs.values()].filter(
      (r) =>
        r.module_id === moduleId &&
        ["admitted", "running", "merging"].includes(r.state),
    ).length;
  }

  clampParallelHint(hint: number): number {
    const remaining = Math.max(0, this.config.max_concurrent_aia - this.runningCount);
    if (remaining === 0) return 1;
    return Math.max(1, Math.min(hint, remaining));
  }

  metrics(): Record<string, number> {
    const queued = [...this.runs.values()].filter((r) => r.state === "queued").length;
    const running = this.runningCount;
    const moduleRejects = [...this.runs.values()].filter(
      (r) => r.fail_reason === "concurrent_jobs_exceeded",
    ).length;
    return {
      aia_running: running,
      aia_queued: queued,
      aia_module_job_reject: moduleRejects,
    };
  }

  tryAdmit(req: AiaAdmissionRequest): AiaAdmissionResult {
    const existing = this.runs.get(req.run_id);
    if (existing && ["admitted", "running", "merging"].includes(existing.state)) {
      return {
        admitted: true,
        run: existing,
        workspace_relpath: existing.workspace_relpath,
      };
    }
    if (existing?.state === "queued") {
      return this.promoteQueuedRun(req.run_id) ?? {
        admitted: false,
        reason: "still queued",
        queued: true,
      };
    }
    if (existing) {
      return { admitted: false, reason: `run ${req.run_id} already tracked` };
    }

    const moduleId = req.module_id ?? resolveModuleIdForAgent(req.agent_id);
    const moduleLimit = resolveConcurrentJobsLimit(req.agent_id);
    const blockReason = this.blockReason(req.agent_id, moduleId, moduleLimit);
    if (blockReason) {
      const now = new Date().toISOString();
      const run: AiaRunRecord = {
        run_id: req.run_id,
        agent_id: req.agent_id,
        module_id: moduleId,
        work_order_id: req.work_order_id,
        state: "queued",
        workspace_relpath: `scratch/aia-runs/${req.run_id}`,
        queued_at: now,
        fail_reason: blockReason,
      };
      this.runs.set(req.run_id, run);
      if (!this.queue.includes(req.run_id)) {
        this.queue.push(req.run_id);
      }
      this.persistQueue();
      return {
        admitted: false,
        reason: blockReason,
        queued: true,
      };
    }

    return this.admitNow(req, moduleId);
  }

  private blockReason(
    agentId: string,
    moduleId: string | undefined,
    moduleLimit: number,
  ): string | null {
    if (moduleId && this.countRunningForModule(moduleId) >= moduleLimit) {
      return `module ${moduleId} concurrent_jobs limit (${moduleLimit}) reached`;
    }
    if (this.activeCount() >= this.config.max_concurrent_aia) {
      return `tenant max_concurrent_aia (${this.config.max_concurrent_aia}) reached`;
    }
    if (this.config.llm_backpressure && !llmPoolHasCapacity()) {
      return "LLM pool at capacity";
    }
    return null;
  }

  private admitNow(req: AiaAdmissionRequest, moduleId?: string): AiaAdmissionResult {
    const workspaceRel = `scratch/aia-runs/${req.run_id}`;
    ensureAiaRunWorkspace(req.run_id);
    const now = new Date().toISOString();
    const run: AiaRunRecord = {
      run_id: req.run_id,
      agent_id: req.agent_id,
      module_id: moduleId ?? req.module_id ?? resolveModuleIdForAgent(req.agent_id),
      work_order_id: req.work_order_id,
      state: "running",
      workspace_relpath: workspaceRel,
      queued_at: now,
      admitted_at: now,
      started_at: now,
    };
    this.runs.set(req.run_id, run);
    const idx = this.queue.indexOf(req.run_id);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.persistQueue();
    return { admitted: true, run, workspace_relpath: workspaceRel };
  }

  private promoteQueuedRun(runId: string): AiaAdmissionResult | null {
    const run = this.runs.get(runId);
    if (!run || run.state !== "queued") return null;
    const blockReason = this.blockReason(
      run.agent_id,
      run.module_id,
      resolveConcurrentJobsLimit(run.agent_id),
    );
    if (blockReason) {
      return { admitted: false, reason: blockReason, queued: true };
    }
    return this.admitNow(
      {
        run_id: run.run_id,
        agent_id: run.agent_id,
        module_id: run.module_id,
        work_order_id: run.work_order_id,
      },
      run.module_id,
    );
  }

  private drainQueue(): void {
    for (const runId of [...this.queue]) {
      this.promoteQueuedRun(runId);
    }
  }

  failQueued(runId: string, reason: string): void {
    const run = this.runs.get(runId);
    if (!run || run.state !== "queued") return;
    this.transition(runId, "failed", reason);
    this.runs.delete(runId);
    const idx = this.queue.indexOf(runId);
    if (idx >= 0) this.queue.splice(idx, 1);
  }

  transition(runId: string, state: AiaRunState, failReason?: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const next: AiaRunRecord = { ...run, state };
    if (state === "done" || state === "failed") {
      next.finished_at = new Date().toISOString();
    }
    if (failReason) next.fail_reason = failReason;
    this.runs.set(runId, next);
    this.persistQueue();
  }

  release(runId: string, ok = true): void {
    this.transition(runId, ok ? "done" : "failed");
    gcAiaRunWorkspace(runId);
    this.runs.delete(runId);
    const idx = this.queue.indexOf(runId);
    if (idx >= 0) this.queue.splice(idx, 1);
    this.drainQueue();
  }
}

export function ensureAiaRunWorkspace(runId: string): string {
  const dir = tenantDataPath("scratch", "aia-runs", runId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitkeep"), "", { encoding: "utf-8" });
  return dir;
}

export function gcAiaRunWorkspace(runId: string): void {
  const dir = tenantDataPath("scratch", "aia-runs", runId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function createAiaScheduler(
  config?: AiaRuntimeFile,
  opts?: { hydrate?: boolean },
): AiaScheduler {
  return new AiaScheduler(config, opts);
}

let sharedScheduler: AiaScheduler | undefined;

/** Process-wide singleton for dispatch admission (ADR 0040). */
export function getSharedAiaScheduler(): AiaScheduler {
  if (!sharedScheduler) {
    sharedScheduler = createAiaScheduler();
  }
  return sharedScheduler;
}

export function resetAiaSchedulerForTests(): void {
  sharedScheduler = undefined;
  saveAiaQueueFile({ schema: "orgos.aia.queue.v1", runs: [], queue_order: [] });
}

/** Drop in-process singleton without wiping persisted queue (restart simulation). */
export function detachAiaSchedulerSingletonForTests(): void {
  sharedScheduler = undefined;
}

export function reloadSharedAiaSchedulerFromDisk(): AiaScheduler {
  sharedScheduler = createAiaScheduler(undefined, { hydrate: true });
  return sharedScheduler;
}

export function persistAiaMetrics(scheduler: AiaScheduler): void {
  const path = aiaRuntimeConfigPath();
  const config = loadAiaRuntimeConfig();
  const next = {
    ...config,
    metrics: {
      ...config.metrics,
      ...scheduler.metrics(),
    },
  };
  writeYamlFile(path, next);
}

/** Wait synchronously for admission (dispatch path). */
export function admitWithBackoff(
  scheduler: AiaScheduler,
  req: AiaAdmissionRequest,
  opts?: { maxWaitMs?: number; intervalMs?: number },
): AiaAdmissionResult {
  const maxWait =
    opts?.maxWaitMs ?? scheduler.runtimeConfig.queue_timeout_seconds * 1000;
  const interval = opts?.intervalMs ?? 50;
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const result = scheduler.tryAdmit(req);
    if (result.admitted) return result;
    if (!result.queued) return result;
    const end = Date.now() + interval;
    while (Date.now() < end) {
      /* brief spin wait */
    }
  }
  scheduler.failQueued(req.run_id, `admission timeout after ${maxWait}ms`);
  return {
    admitted: false,
    reason: `admission timeout after ${maxWait}ms`,
  };
}

export function readAiaRunManifest(runId: string): unknown | null {
  const manifestPath = join(tenantDataPath("scratch", "aia-runs", runId), "manifest.json");
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}
