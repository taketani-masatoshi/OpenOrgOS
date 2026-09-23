import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  aiaRunWorkspaceRelPath,
  isActiveAiaRunState,
  type AiaRunRecord,
  type AiaRunState,
  type AiaRuntimeFile,
} from "../../../schemas/aia-runtime.js";
import { getTenantId, tenantDataPath } from "../tenant.js";
import { hydrateAiaQueueState, persistAiaQueueState, saveAiaQueueFile } from "./queue-store.js";
import { loadAiaRuntimeConfig } from "./runtime-config.js";
import {
  llmPoolHasCapacity,
  resolveConcurrentJobsLimit,
  resolveModuleIdForAgent,
  type AiaAdmissionRequest,
  type AiaAdmissionResult,
} from "./admission.js";

export {
  aiaRuntimeConfigPath,
  loadAiaRuntimeConfig,
  saveAiaRuntimeConfig,
  persistAiaMetrics,
} from "./runtime-config.js";

export {
  resolveModuleIdForAgent,
  resolveConcurrentJobsLimit,
  type AiaAdmissionRequest,
  type AiaAdmissionResult,
} from "./admission.js";

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
    return [...this.runs.values()].filter((r) => isActiveAiaRunState(r.state)).length;
  }

  get runningCount(): number {
    return this.activeCount();
  }

  countRunningForModule(moduleId: string): number {
    return [...this.runs.values()].filter(
      (r) => r.module_id === moduleId && isActiveAiaRunState(r.state)
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
      (r) => r.fail_reason === "concurrent_jobs_exceeded"
    ).length;
    return {
      aia_running: running,
      aia_queued: queued,
      aia_module_job_reject: moduleRejects,
    };
  }

  tryAdmit(req: AiaAdmissionRequest): AiaAdmissionResult {
    const existing = this.runs.get(req.run_id);
    if (existing && isActiveAiaRunState(existing.state)) {
      return {
        admitted: true,
        run: existing,
        workspace_relpath: existing.workspace_relpath,
      };
    }
    if (existing?.state === "queued") {
      return (
        this.promoteQueuedRun(req.run_id) ?? {
          admitted: false,
          reason: "still queued",
          queued: true,
        }
      );
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
        workspace_relpath: aiaRunWorkspaceRelPath(req.run_id),
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
    moduleLimit: number
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
    const workspaceRel = aiaRunWorkspaceRelPath(req.run_id);
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
      resolveConcurrentJobsLimit(run.agent_id)
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
      run.module_id
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

/** writeFileSync site — keep in this file (canonical-write-baseline). */
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
  opts?: { hydrate?: boolean }
): AiaScheduler {
  return new AiaScheduler(config, opts);
}

const sharedSchedulersByTenant = new Map<string, AiaScheduler>();

/** Per-tenant singleton for dispatch admission (ADR 0040). */
export function getSharedAiaScheduler(): AiaScheduler {
  const tenantId = getTenantId();
  let scheduler = sharedSchedulersByTenant.get(tenantId);
  if (!scheduler) {
    scheduler = createAiaScheduler();
    sharedSchedulersByTenant.set(tenantId, scheduler);
  }
  return scheduler;
}

export function resetAiaSchedulerForTests(): void {
  sharedSchedulersByTenant.clear();
  saveAiaQueueFile({ schema: "orgos.aia.queue.v1", runs: [], queue_order: [] });
}

/** Drop in-process singleton without wiping persisted queue (restart simulation). */
export function detachAiaSchedulerSingletonForTests(): void {
  sharedSchedulersByTenant.clear();
}

/** Wait synchronously for admission (dispatch path). */
export function admitWithBackoff(
  scheduler: AiaScheduler,
  req: AiaAdmissionRequest,
  opts?: { maxWaitMs?: number; intervalMs?: number }
): AiaAdmissionResult {
  const maxWait = opts?.maxWaitMs ?? scheduler.runtimeConfig.queue_timeout_seconds * 1000;
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
