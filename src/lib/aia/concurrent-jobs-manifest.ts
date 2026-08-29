/**
 * ADR 0040 — cross-manifest validation for limits.concurrent_jobs.
 */

import {
  listCatalogModuleIds,
  loadEnabledModules,
  loadModuleManifest,
  type ModuleCheckIssue,
} from "../modules.js";
import { loadAiaRuntimeConfig, resolveConcurrentJobsLimit } from "./scheduler.js";

export type ConcurrentJobsManifestRow = {
  module_id: string;
  enabled: boolean;
  explicit?: number;
  effective: number;
  trust_class: string;
};

/** Effective concurrent_jobs limits for catalog modules (enabled tenant modules flagged). */
export function listConcurrentJobsManifestRows(): ConcurrentJobsManifestRow[] {
  const enabled = new Set(loadEnabledModules().map((m) => m.id));
  const rows: ConcurrentJobsManifestRow[] = [];
  for (const id of listCatalogModuleIds()) {
    const manifest = loadModuleManifest(id);
    if (!manifest) continue;
    const explicit = manifest.security?.limits?.concurrent_jobs;
    rows.push({
      module_id: id,
      enabled: enabled.has(id),
      explicit,
      effective: resolveConcurrentJobsLimit(id),
      trust_class: manifest.security?.trust_class ?? "internal",
    });
  }
  return rows.sort((a, b) => a.module_id.localeCompare(b.module_id));
}

/** Fail when explicit concurrent_jobs exceeds tenant max_concurrent_aia. */
export function checkConcurrentJobsManifest(): ModuleCheckIssue[] {
  const issues: ModuleCheckIssue[] = [];
  const tenantMax = loadAiaRuntimeConfig().max_concurrent_aia;

  for (const row of listConcurrentJobsManifestRows()) {
    if (row.explicit !== undefined && row.explicit > tenantMax) {
      issues.push({
        moduleId: row.module_id,
        message: `security.limits.concurrent_jobs (${row.explicit}) exceeds tenant max_concurrent_aia (${tenantMax})`,
      });
    }
    if (row.explicit !== undefined && row.explicit < 1) {
      issues.push({
        moduleId: row.module_id,
        message: "security.limits.concurrent_jobs must be a positive integer",
      });
    }
  }

  for (const mod of loadEnabledModules()) {
    const effective = resolveConcurrentJobsLimit(mod.id);
    if (effective < 1) {
      issues.push({
        moduleId: mod.id,
        message: `enabled module resolves to invalid concurrent_jobs limit (${effective})`,
      });
    }
    if (!loadModuleManifest(mod.id)) {
      issues.push({
        moduleId: mod.id,
        message: "enabled module missing module.manifest.yaml (concurrent_jobs cannot be resolved)",
      });
    }
  }

  return issues;
}

export function formatConcurrentJobsManifestTable(): string {
  const rows = listConcurrentJobsManifestRows().filter((r) => r.enabled || r.explicit !== undefined);
  if (rows.length === 0) return "(no modules with concurrent_jobs metadata)";
  const lines = [
    "| Module | Enabled | explicit | effective | trust |",
    "|--------|---------|----------|-----------|-------|",
    ...rows.map(
      (r) =>
        `| ${r.module_id} | ${r.enabled ? "yes" : "no"} | ${r.explicit ?? "—"} | ${r.effective} | ${r.trust_class} |`,
    ),
  ];
  return lines.join("\n");
}
