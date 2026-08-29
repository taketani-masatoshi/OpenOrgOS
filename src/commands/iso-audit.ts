import type { IsoRoadmapTier } from "../../schemas/iso-catalog.js";
import { setTenantId } from "../lib/tenant.js";
import {
  verifyIsoMaps,
  listIsoMapStatuses,
  listIsoCatalogEntries,
  listComingSoonIsoEntries,
} from "../lib/iso-catalog.js";
import {
  evaluateIsoInternalAudit,
  formatIsoInternalAuditReport,
  latestIsoInternalAuditRun,
  loadIsoInternalAuditRuns,
  persistIsoInternalAuditRun,
} from "../lib/iso-internal-audit.js";

export interface IsoAuditCliOptions {
  tenant?: string;
  json?: boolean;
  iso?: string;
  dryRun?: boolean;
  strict?: boolean;
  runId?: string;
  status?: string;
  tier?: string;
}

function applyTenant(opts: IsoAuditCliOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
}

export function runIsoCatalog(opts: IsoAuditCliOptions = {}): void {
  applyTenant(opts);
  const filter = opts.status;
  const entries = listIsoCatalogEntries().filter((e) => !filter || e.status === filter);
  const keep = new Set(entries.map((e) => e.id));
  const statuses = listIsoMapStatuses().filter((s) => keep.has(s.id));
  if (opts.json) {
    console.log(JSON.stringify({ entries, maps: statuses }, null, 2));
    return;
  }
  const available = entries.filter((e) => e.status === "available").length;
  console.log(
    `ISO catalog: ${entries.length} standard(s) · available ${available} · coming soon ${entries.length - available}\n`
  );
  console.log("| ID | Kind | Status | Folder | Map | Controls |");
  console.log("|----|------|--------|--------|-----|----------|");
  for (const s of statuses) {
    const map = s.skipped ? "skipped" : s.map_ok ? "ok" : (s.error ?? "fail");
    const folder = s.skipped ? "—" : s.folder_ok ? "ok" : "missing";
    console.log(
      `| ${s.id} | ${s.kind} | ${s.status} | ${folder} | ${map} | ${s.control_count} |`
    );
  }
}

export function runIsoRoadmap(opts: IsoAuditCliOptions = {}): void {
  applyTenant(opts);
  const entries = listComingSoonIsoEntries(opts.tier as IsoRoadmapTier | undefined);
  if (opts.json) {
    console.log(JSON.stringify({ entries }, null, 2));
    return;
  }
  if (entries.length === 0) {
    console.log("Coming Soon の登録がありません。");
    return;
  }
  console.log(`ISO roadmap — coming soon: ${entries.length} 件\n`);
  const byTier = new Map<string, typeof entries>();
  for (const e of entries) {
    const tier = e.tier ?? "—";
    byTier.set(tier, [...(byTier.get(tier) ?? []), e]);
  }
  for (const [tier, list] of [...byTier.entries()].sort()) {
    console.log(`## Tier ${tier}\n`);
    console.log("| ID | 規格 | 版 | 種別 | 位置づけ |");
    console.log("|----|------|----|------|----------|");
    for (const e of list) {
      const rel = e.relevance ?? (e.extends ? `${e.extends} の拡張` : "—");
      console.log(`| ${e.id} | ${e.title} | ${e.year} | ${e.kind} | ${rel} |`);
    }
    console.log("");
  }
  console.log("昇格: orgos iso scaffold <id>");
}

export function runIsoMapsVerify(opts: IsoAuditCliOptions = {}): void {
  applyTenant(opts);
  const { ok, statuses } = verifyIsoMaps();
  if (opts.json) {
    console.log(JSON.stringify({ ok, statuses }, null, 2));
  } else {
    runIsoCatalog(opts);
    console.log(ok ? "\n✓ All catalog maps parse" : "\n✗ One or more maps failed");
  }
  if (!ok) process.exit(1);
}

export function runIsoAuditRun(opts: IsoAuditCliOptions = {}): void {
  applyTenant(opts);
  const run = evaluateIsoInternalAudit({ iso: opts.iso });
  if (opts.dryRun) {
    if (opts.json) {
      console.log(JSON.stringify(run, null, 2));
    } else {
      console.log(formatIsoInternalAuditReport(run));
    }
    if (opts.strict && run.overall === "nonconform") process.exit(1);
    return;
  }
  const { logPath, reportPaths } = persistIsoInternalAuditRun(run);
  if (opts.json) {
    console.log(JSON.stringify({ run, logPath, reportPaths }, null, 2));
  } else {
    console.log(`✓ ${run.id} · ${run.overall} · findings ${run.summary.total}`);
    console.log(`  log ${logPath}`);
    for (const p of reportPaths) console.log(`  report ${p}`);
  }
  if (opts.strict && run.overall === "nonconform") process.exit(1);
}

export function runIsoAuditReport(opts: IsoAuditCliOptions = {}): void {
  applyTenant(opts);
  const runs = loadIsoInternalAuditRuns();
  const run = opts.runId ? runs.find((r) => r.id === opts.runId) : latestIsoInternalAuditRun();
  if (!run) {
    console.error(opts.runId ? `Run not found: ${opts.runId}` : "No ISO internal audit runs yet. orgos iso audit run");
    process.exit(1);
  }
  const idx = runs.findIndex((r) => r.id === run.id);
  const previous = idx > 0 ? runs[idx - 1] : undefined;
  if (opts.json) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  console.log(formatIsoInternalAuditReport(run, previous));
}
