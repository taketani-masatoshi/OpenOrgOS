/**
 * Migrate per-standard HLS control ids to the shared core controls.
 * Maturity history is preserved: a core control inherits the highest maturity
 * among the ids it supersedes, so folding controls never silently downgrades a
 * tenant that already reached L3 on, say, ISO 9001 internal audit.
 */

import { existsSync } from "node:fs";
import {
  tenantControlsFileSchema,
  type ControlMaturity,
  type TenantControlStatus,
} from "../../schemas/control-framework.js";
import {
  controlsFilePath,
  loadControlMaps,
  loadCoreControls,
  maturityRank,
} from "../lib/control-framework.js";
import { setTenantId } from "../lib/tenant.js";
import { readYamlFile, writeYamlFile } from "../lib/utils.js";

export interface ControlsMigrateCoreOptions {
  tenant?: string;
  write?: boolean;
  json?: boolean;
}

export interface CoreMigrationRow {
  core_id: string;
  from_ids: string[];
  maturity: ControlMaturity;
  previous_maturity?: ControlMaturity;
  last_reviewed?: string;
  notes?: string;
}

export interface CoreMigrationPlan {
  path: string;
  rows: CoreMigrationRow[];
  removed_ids: string[];
  /** Tenant entries whose control no longer exists in any enabled map. */
  orphan_ids: string[];
  changed: boolean;
}

function pickMaturity(entries: TenantControlStatus[]): ControlMaturity {
  return entries.reduce<ControlMaturity>(
    (best, e) => (maturityRank(e.maturity) > maturityRank(best) ? e.maturity : best),
    "L0"
  );
}

function pickLastReviewed(entries: TenantControlStatus[]): string | undefined {
  return entries
    .map((e) => e.last_reviewed)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
}

export function planCoreMigration(): CoreMigrationPlan {
  const path = controlsFilePath();
  const file = existsSync(path)
    ? readYamlFile(path, tenantControlsFileSchema)
    : { version: "1", controls: [] as TenantControlStatus[] };
  const byId = new Map(file.controls.map((c) => [c.id, c]));

  const rows: CoreMigrationRow[] = [];
  const removed: string[] = [];

  for (const core of loadCoreControls()) {
    const sources = core.supersedes
      .map((id) => byId.get(id))
      .filter((e): e is TenantControlStatus => Boolean(e));
    const existing = byId.get(core.id);
    if (sources.length === 0) continue;

    const pool = existing ? [existing, ...sources] : sources;
    const notes = [
      ...new Set(pool.map((e) => e.notes).filter((n): n is string => Boolean(n))),
    ].join(" · ");

    rows.push({
      core_id: core.id,
      from_ids: sources.map((e) => e.id),
      maturity: pickMaturity(pool),
      previous_maturity: existing?.maturity,
      last_reviewed: pickLastReviewed(pool),
      ...(notes ? { notes } : {}),
    });
    removed.push(...sources.map((e) => e.id));
  }

  const knownIds = new Set(loadControlMaps().map((c) => c.id));
  const removedSet = new Set(removed);
  const orphan_ids = file.controls
    .map((c) => c.id)
    .filter((id) => !knownIds.has(id) && !removedSet.has(id));

  return { path, rows, removed_ids: removed, orphan_ids, changed: rows.length > 0 };
}

export function applyCoreMigration(plan: CoreMigrationPlan): void {
  const file = readYamlFile(plan.path, tenantControlsFileSchema);
  const removed = new Set(plan.removed_ids);
  const rowById = new Map(plan.rows.map((r) => [r.core_id, r]));

  const kept = file.controls.filter((c) => !removed.has(c.id) && !rowById.has(c.id));
  const migrated: TenantControlStatus[] = plan.rows.map((r) => ({
    id: r.core_id,
    maturity: r.maturity,
    ...(r.last_reviewed ? { last_reviewed: r.last_reviewed } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
  }));

  writeYamlFile(plan.path, {
    ...file,
    as_of: new Date().toISOString().slice(0, 10),
    controls: [...migrated, ...kept].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function runControlsMigrateCore(opts: ControlsMigrateCoreOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const plan = planCoreMigration();

  if (opts.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (!plan.changed) {
    console.log("移行対象なし。コア統制はすでに最新です。");
  } else {
    console.log(`# controls migrate-core — ${plan.path}\n`);
    console.log("| コア統制 | 引き継ぎ元 | 成熟度 | 最終レビュー |");
    console.log("|----------|------------|--------|--------------|");
    for (const r of plan.rows) {
      const before = r.previous_maturity ? `${r.previous_maturity} → ` : "";
      console.log(
        `| ${r.core_id} | ${r.from_ids.join(", ")} | ${before}${r.maturity} | ${r.last_reviewed ?? "—"} |`
      );
    }
    console.log(`\n削除される旧 ID: ${plan.removed_ids.length} 件`);
    if (plan.orphan_ids.length > 0) {
      console.log(
        `どのマップにも無い ID（手動確認）: ${plan.orphan_ids.join(", ")}`
      );
    }
  }

  if (!opts.write) {
    if (!opts.json) console.log("\ndry-run。適用するには --write を付けてください。");
    return;
  }
  if (!plan.changed) return;
  applyCoreMigration(plan);
  if (!opts.json) console.log(`\n✓ 適用しました: ${plan.path}`);
}
