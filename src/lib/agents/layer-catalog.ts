/**
 * Agent infrastructure layer map for dependency-direction contracts.
 * Lower rank must not import higher rank (except explicit baseline edges).
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export type AgentInfraLayer =
  | "llm_pool"
  | "catalog"
  | "roster"
  | "reporting"
  | "aia"
  | "orchestration"
  | "dispatch"
  | "verify"
  | "apps"
  /** Out-of-scope peer tracked only for the readiness↔pulse cycle. */
  | "pulse_peer"
  /** Out-of-scope peer used by reporting (workspace ensure). */
  | "workspace_peer";

export const AGENT_INFRA_LAYER_RANK: Record<AgentInfraLayer, number> = {
  llm_pool: 0,
  catalog: 1,
  roster: 2,
  reporting: 3,
  aia: 4,
  orchestration: 5,
  dispatch: 6,
  pulse_peer: 6.5,
  workspace_peer: 6.5,
  verify: 7,
  apps: 8,
};

/**
 * Ownership map for every Agent-infra implementation module in scope.
 * Paths are repo-relative. New files under src/lib/agents/** must be added here.
 */
export const AGENT_INFRA_FILE_LAYER: Readonly<Record<string, AgentInfraLayer>> = {
  "src/lib/llm-pool/health.ts": "llm_pool",
  "src/lib/llm-pool/index.ts": "llm_pool",
  "src/lib/llm-pool/registry.ts": "llm_pool",
  "src/lib/llm-pool/router.ts": "llm_pool",
  "src/lib/llm-pool/stats.ts": "llm_pool",

  "src/lib/agent-capability.ts": "catalog",
  "src/lib/agents/catalog.ts": "catalog",
  "src/lib/agents/definition.ts": "catalog",
  "src/lib/agents/utc-date.ts": "catalog",
  "src/lib/agent-owner-desks.ts": "catalog",

  // Public facade re-exports activation; pure loaders live in agents/catalog.ts
  "src/lib/agent-catalog.ts": "roster",
  "src/lib/agent-activation.ts": "roster",
  "src/lib/agent-roster.ts": "roster",

  "src/lib/agent-reporting.ts": "reporting",
  "src/lib/agents/reporting/chain-policy.ts": "reporting",
  "src/lib/agents/reporting/mission-store.ts": "reporting",
  "src/lib/agents/reporting/relay.ts": "reporting",
  "src/lib/agents/reporting/inbox-format.ts": "reporting",
  "src/lib/agent-inbox.ts": "reporting",

  "src/lib/aia/concurrent-jobs-manifest.ts": "aia",
  "src/lib/aia/queue-store.ts": "aia",
  "src/lib/aia/scheduler.ts": "aia",
  "src/lib/aia/runtime-config.ts": "aia",
  "src/lib/aia/admission.ts": "aia",

  "src/lib/orchestration/board-view.ts": "orchestration",
  "src/lib/orchestration/plan-proposal.ts": "orchestration",
  "src/lib/orchestration/orchestrate-actions.ts": "orchestration",
  "src/lib/orchestration/plan-graph.ts": "orchestration",
  "src/lib/orchestration/work-order-state.ts": "orchestration",

  "src/lib/agent-dispatch.ts": "dispatch",
  "src/lib/agent-cloud-watch.ts": "dispatch",
  "src/lib/agents/dispatch/manifest.ts": "dispatch",
  "src/lib/agents/dispatch/task-runners.ts": "dispatch",
  "src/lib/agents/dispatch/cursor-sdk.ts": "dispatch",
  "src/lib/agents/dispatch/wave-run.ts": "dispatch",
  "src/lib/agents/dispatch/plan-format.ts": "dispatch",

  "src/lib/agent-activation-verify.ts": "verify",
  "src/lib/agent-alignment.ts": "verify",
  "src/lib/agent-authority-verify.ts": "verify",
  "src/lib/agent-capability-sync.ts": "verify",
  "src/lib/agent-docs-sync.ts": "verify",
  "src/lib/agents/docs-sync/generated-section.ts": "verify",
  "src/lib/agents/docs-sync/org-chart.ts": "verify",
  "src/lib/agents/docs-sync/roster-index.ts": "verify",
  "src/lib/agents/docs-sync/delegation-map.ts": "verify",
  "src/lib/agents/docs-sync/drift.ts": "verify",
  "src/lib/agent-portability.ts": "verify",
  "src/lib/agents/portability/prompt-ref.ts": "verify",
  "src/lib/agents/portability/pack-export.ts": "verify",
  "src/lib/agents/portability/mcp-snippets.ts": "verify",
  "src/lib/agents/portability/assessment.ts": "verify",
  "src/lib/agent-readiness.ts": "verify",
  "src/lib/agents/readiness/axes.ts": "verify",
  "src/lib/agents/readiness/weights.ts": "verify",
  "src/lib/agents/readiness/profiles.ts": "verify",
  "src/lib/agents/readiness/report.ts": "verify",

  "src/lib/mcp/audit.ts": "apps",
  "src/lib/mcp/auth.ts": "apps",
  "src/lib/mcp/http-server.ts": "apps",
  "src/lib/mcp/steward-server.ts": "apps",
  "src/lib/mcp/tools.ts": "apps",
  "src/lib/mcp/result.ts": "apps",
  "src/lib/mcp/tools/definitions.ts": "apps",
  "src/lib/mcp/tools/rate-limit.ts": "apps",
  "src/lib/mcp/tools/steward.ts": "apps",
  "src/lib/mcp/tools/witness.ts": "apps",
  "src/lib/mcp/tools/ledger.ts": "apps",
  "src/lib/tasks/intake.ts": "apps",
  "src/lib/tasks/store.ts": "apps",
  "src/lib/tasks/task-view.ts": "apps",
  "src/lib/tasks/candidate-priority.ts": "apps",
  "src/lib/pmo/index.ts": "apps",
  "src/lib/pmo/integrity.ts": "apps",
  "src/lib/pmo/load.ts": "apps",
  "src/lib/pmo/portfolio-view.ts": "apps",
  "src/lib/notifications/macos-notify.ts": "apps",
  "src/lib/notifications/push.ts": "apps",
  "src/lib/agent-summaries.ts": "apps",

  // Dependency guards (meta) — may import any layer for scanning only
  "src/lib/agents/layer-catalog.ts": "verify",
  "src/lib/agents/layer-dependency-scan.ts": "verify",
  "src/lib/agents/layer-violation-baseline.ts": "verify",

  // Out of refactor scope — tracked for known cycles only
  "src/lib/agent-pulse.ts": "pulse_peer",
  "src/lib/agent-workspace.ts": "workspace_peer",
};

const SCOPED_TOP_LEVEL = new Set([
  "agent-activation-verify.ts",
  "agent-activation.ts",
  "agent-alignment.ts",
  "agent-authority-verify.ts",
  "agent-capability-sync.ts",
  "agent-capability.ts",
  "agent-catalog.ts",
  "agent-cloud-watch.ts",
  "agent-dispatch.ts",
  "agent-docs-sync.ts",
  "agent-inbox.ts",
  "agent-owner-desks.ts",
  "agent-portability.ts",
  "agent-readiness.ts",
  "agent-reporting.ts",
  "agent-roster.ts",
  "agent-summaries.ts",
]);

const SCOPED_DIRS = [
  "aia",
  "llm-pool",
  "mcp",
  "orchestration",
  "pmo",
  "tasks",
  "notifications",
  "agents",
] as const;

function listTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsFiles(abs, out);
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
  return out;
}

/** Every in-scope implementation file (excludes pulse/workspace peers). */
export function listAgentInfraScopedFiles(): string[] {
  const lib = join(ROOT_DIR, "src/lib");
  const files: string[] = [];
  for (const name of SCOPED_TOP_LEVEL) {
    files.push(join(lib, name));
  }
  for (const dir of SCOPED_DIRS) {
    listTsFiles(join(lib, dir), files);
  }
  return files.map((abs) => relative(ROOT_DIR, abs).replace(/\\/g, "/")).sort();
}

export function resolveAgentInfraFileLayer(relPath: string): AgentInfraLayer | undefined {
  return AGENT_INFRA_FILE_LAYER[relPath];
}

export function validateAgentInfraLayerCatalog(): string[] {
  const issues: string[] = [];
  for (const rel of listAgentInfraScopedFiles()) {
    if (!AGENT_INFRA_FILE_LAYER[rel]) {
      issues.push(`unassigned agent-infra file: ${rel}`);
    }
  }
  for (const [rel, layer] of Object.entries(AGENT_INFRA_FILE_LAYER)) {
    if (layer === "pulse_peer" || layer === "workspace_peer") continue;
    const abs = join(ROOT_DIR, rel);
    if (!existsSync(abs)) {
      issues.push(`catalog path missing: ${rel}`);
    }
  }
  return issues;
}
