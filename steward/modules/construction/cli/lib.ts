import {
  daysUntil,
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../src/lib/module-business-data.js";
import {
  constructionPhasesFileSchema,
  constructionSitesFileSchema,
  PHASE_STATUS_COMPLETE,
  SITE_STATUS_IN_PROGRESS,
  type ConstructionPhase,
  type ConstructionSite,
} from "./schema.js";

export const MODULE_ID = "construction";

function loadSites() {
  return loadModuleDataFile(MODULE_ID, "sites.yaml", constructionSitesFileSchema);
}

function loadPhases() {
  return loadModuleDataFile(MODULE_ID, "phases.yaml", constructionPhasesFileSchema);
}

interface OpenPhaseView {
  id: string;
  name: string;
  status: string;
  planned_end?: string;
  days_remaining?: number;
}

interface SiteProgressView {
  site_id: string;
  name: string;
  client?: string;
  start_date?: string;
  end_date?: string;
  phases_total: number;
  phases_complete: number;
  open_phases: OpenPhaseView[];
}

function toOpenPhaseView(phase: ConstructionPhase): OpenPhaseView {
  return {
    id: phase.id,
    name: phase.name,
    status: phase.status,
    planned_end: phase.planned_end,
    days_remaining: phase.planned_end ? daysUntil(phase.planned_end) : undefined,
  };
}

/** In-progress sites with their phase roll-up — phase.site_id resolved against sites. */
export function buildSiteProgress(
  sites: ConstructionSite[],
  phases: ConstructionPhase[],
  siteFilter?: string
): SiteProgressView[] {
  return sites
    .filter((site) => site.status === SITE_STATUS_IN_PROGRESS)
    .filter((site) => !siteFilter || site.id === siteFilter)
    .map((site) => {
      const own = phases.filter((phase) => phase.site_id === site.id);
      return {
        site_id: site.id,
        name: site.name,
        client: site.client,
        start_date: site.start_date,
        end_date: site.end_date,
        phases_total: own.length,
        phases_complete: own.filter((p) => p.status === PHASE_STATUS_COMPLETE).length,
        open_phases: own.filter((p) => p.status !== PHASE_STATUS_COMPLETE).map(toOpenPhaseView),
      };
    });
}

export function runConstructionShow(opts: { json?: boolean }): void {
  const sites = loadSites();
  const phases = loadPhases();
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    sites: sites?.data.sites.length ?? 0,
    sites_in_progress:
      sites?.data.sites.filter((s) => s.status === SITE_STATUS_IN_PROGRESS).length ?? 0,
    phases: phases?.data.phases.length ?? 0,
    phases_open:
      phases?.data.phases.filter((p) => p.status !== PHASE_STATUS_COMPLETE).length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# construction\n`);
  console.log(`sites: ${summary.sites} · in progress: ${summary.sites_in_progress}`);
  console.log(`phases: ${summary.phases} · open: ${summary.phases_open}`);
}

function collectDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function checkPhaseIntegrity(sites: ConstructionSite[], phases: ConstructionPhase[]): string[] {
  const issues: string[] = [];
  const siteIds = new Set(sites.map((s) => s.id));
  for (const phase of phases) {
    if (!siteIds.has(phase.site_id)) {
      issues.push(`${phase.id}: unknown site_id ${phase.site_id}`);
    }
    if (phase.status === PHASE_STATUS_COMPLETE && !phase.actual_end) {
      issues.push(`${phase.id}: status complete without actual_end`);
    }
  }
  return issues;
}

export function runConstructionValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const sites = loadSites();
  const phases = loadPhases();
  if (!sites) issues.push("sites.yaml missing");
  if (!phases) issues.push("phases.yaml missing");
  if (sites) {
    for (const id of collectDuplicateIds(sites.data.sites.map((s) => s.id))) {
      issues.push(`sites.yaml: duplicate site id ${id}`);
    }
  }
  if (phases) {
    for (const id of collectDuplicateIds(phases.data.phases.map((p) => p.id))) {
      issues.push(`phases.yaml: duplicate phase id ${id}`);
    }
  }
  if (sites && phases) issues.push(...checkPhaseIntegrity(sites.data.sites, phases.data.phases));

  if (issues.length) {
    console.error("✗ construction:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("✓ construction — sites/phases OK");
}

function formatOpenPhase(phase: OpenPhaseView): string {
  if (phase.days_remaining === undefined) {
    return `${phase.id} ${phase.name} · ${phase.status} · planned end 未設定`;
  }
  const window =
    phase.days_remaining < 0
      ? `${Math.abs(phase.days_remaining)}d overdue`
      : `${phase.days_remaining}d left`;
  return `${phase.id} ${phase.name} · ${phase.status} · planned end ${phase.planned_end} (${window})`;
}

function printSiteProgress(rows: SiteProgressView[]): void {
  console.log("# Construction — in-progress sites\n");
  if (!rows.length) {
    console.log(`(no site with status ${SITE_STATUS_IN_PROGRESS})`);
    return;
  }
  for (const row of rows) {
    const window = [row.start_date, row.end_date].filter(Boolean).join(" → ") || "工期未設定";
    console.log(`## ${row.site_id} ${row.name}${row.client ? ` · ${row.client}` : ""} · ${window}`);
    console.log(`   phases: ${row.phases_complete}/${row.phases_total} complete`);
    for (const phase of row.open_phases) console.log(`   - ${formatOpenPhase(phase)}`);
    if (!row.open_phases.length) console.log("   - (no open phase recorded)");
    console.log("");
  }
}

export function runConstructionSiteProgress(opts: { site?: string; json?: boolean }): void {
  const sites = loadSites();
  if (!sites) {
    console.error("sites.yaml not found");
    process.exit(1);
  }
  const phases = loadPhases();
  const rows = buildSiteProgress(sites.data.sites, phases?.data.phases ?? [], opts.site);
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printSiteProgress(rows);
}
