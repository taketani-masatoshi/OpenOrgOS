/**
 * Compose Module Maturity Panel for Operator Console `/modules/maturity/`.
 * Path: src/lib/module-maturity/build-panel.ts
 * ADR: docs/adr/0074-module-maturity-panel.md
 */
import {
  moduleMaturityPanelSchema,
  type CoreLane,
  type LaneLevel,
  type ModuleMaturityPanel,
  type ModuleMaturityRow,
} from "../../../schemas/module-maturity.js";
import { getCatalogAgent } from "../agent-catalog.js";
import { getModuleTier } from "../module-readiness.js";
import {
  listTenantScopeCatalogModuleIds,
  loadModuleManifest,
  loadModulesFileSafe,
  MODULE_TO_CLASSIFICATION_AGENT,
  type ModuleAgentId,
} from "../modules.js";
import { collectOpsLaneCounts } from "../ops-lane-counts.js";
import { getTenantId } from "../tenant.js";
import { currentDate } from "../utils.js";

function moduleLabel(catalogId: string): string {
  const own = getCatalogAgent(catalogId);
  if (own?.name_ja || own?.name) return own.name_ja ?? own.name;
  const mapped = MODULE_TO_CLASSIFICATION_AGENT[catalogId as ModuleAgentId];
  const owner = mapped ? getCatalogAgent(mapped) : undefined;
  if (owner?.name_ja || owner?.name) return owner.name_ja ?? owner.name;
  return catalogId;
}

function moduleHref(id: string, enabled: boolean): string | undefined {
  if (id === "hospitality" || id === "rental") return "/properties/";
  if (id === "sales") return "/customers/";
  if (!enabled) return "/modules/";
  return "/modules/maturity/";
}

function collectModules(): ModuleMaturityRow[] {
  const tenantMods = loadModulesFileSafe().modules;
  const byId = new Map(tenantMods.map((m) => [m.id, m]));
  const rows: ModuleMaturityRow[] = [];
  for (const id of listTenantScopeCatalogModuleIds()) {
    const tm = byId.get(id);
    const installed = Boolean(tm);
    const enabled = Boolean(tm?.enabled);
    const tier = getModuleTier(id);
    const notes =
      tm?.notes?.trim() ||
      loadModuleManifest(id)?.notes?.trim() ||
      undefined;
    const risk = enabled && tier !== "production_ready";
    const risk_severity =
      risk && (tier === "skeleton" || tier === "experimental")
        ? ("skeleton_enabled" as const)
        : risk && tier === "activation_ready"
          ? ("activation_enabled" as const)
          : undefined;
    rows.push({
      id,
      label: moduleLabel(id),
      tier,
      installed,
      enabled,
      risk,
      risk_severity,
      notes,
      href: moduleHref(id, enabled),
    });
  }
  rows.sort((a, b) => {
    const sev = (r: ModuleMaturityRow) =>
      r.risk_severity === "skeleton_enabled"
        ? 0
        : r.risk_severity === "activation_enabled"
          ? 1
          : 2;
    if (sev(a) !== sev(b)) return sev(a) - sev(b);
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return rows;
}

function lane(
  id: CoreLane["id"],
  label_key: string,
  level: LaneLevel,
  surface: CoreLane["surface"],
  load: CoreLane["load"],
  summary_key: string,
  href: string,
  signals: string[],
): CoreLane {
  return { id, label_key, level, surface, load, summary_key, href, signals };
}

function collectLanes(): CoreLane[] {
  const c = collectOpsLaneCounts();
  const lanes: CoreLane[] = [];

  // Secretary
  if (!c.workbench_ok) {
    lanes.push(
      lane(
        "secretary",
        "lane.secretary",
        "missing",
        "missing",
        "idle",
        "secretary.missing",
        "/secretary/workbench/",
        [],
      ),
    );
  } else {
    const active = c.mail + c.drafts + c.tasks_open > 0;
    lanes.push(
      lane(
        "secretary",
        "lane.secretary",
        "operational",
        "ready",
        active ? "active" : "idle",
        active ? "secretary.active" : "secretary.idle",
        "/secretary/workbench/",
        [`mail=${c.mail}`, `drafts=${c.drafts}`, `tasks=${c.tasks_open}`],
      ),
    );
  }

  // Mail
  if (!c.workbench_ok) {
    lanes.push(
      lane("mail", "lane.mail", "missing", "missing", "idle", "mail.missing", "/wire/", []),
    );
  } else {
    const closed = c.mail > 0 && c.drafts > 0;
    const active = c.mail > 0 || c.drafts > 0;
    lanes.push(
      lane(
        "mail",
        "lane.mail",
        closed ? "closed" : "operational",
        "ready",
        active ? "active" : "idle",
        closed ? "mail.closed" : active ? "mail.active" : "mail.idle",
        "/wire/",
        [`mail=${c.mail}`, `drafts=${c.drafts}`],
      ),
    );
  }

  // Task
  if (!c.tasks_ok) {
    lanes.push(
      lane(
        "task",
        "lane.task",
        "missing",
        "missing",
        "idle",
        "task.missing",
        "/secretary/workbench/",
        [],
      ),
    );
  } else {
    let level: LaneLevel = "operational";
    if (c.tasks_open > 0 && (c.asana_mirrored > 0 || c.candidates > 0)) {
      level = "closed";
    }
    const active = c.tasks_open > 0 || c.candidates > 0;
    lanes.push(
      lane(
        "task",
        "lane.task",
        level,
        "ready",
        active ? "active" : "idle",
        level === "closed" ? "task.closed" : active ? "task.active" : "task.idle",
        "/secretary/workbench/",
        [
          `open=${c.tasks_open}`,
          `p0=${c.tasks_p0}`,
          `candidates=${c.candidates}`,
          `asana=${c.asana_mirrored}`,
        ],
      ),
    );
  }

  // Wire
  if (!c.wire_ok) {
    lanes.push(
      lane(
        "wire",
        "lane.wire",
        "missing",
        "missing",
        "idle",
        "wire.missing",
        "/wire/demo/",
        [],
      ),
    );
  } else if (!c.peers_present) {
    lanes.push(
      lane(
        "wire",
        "lane.wire",
        "thin",
        "ready",
        "idle",
        "wire.no_peers",
        "/wire/demo/",
        ["peers=missing"],
      ),
    );
  } else {
    const active = c.wire_pending > 0;
    lanes.push(
      lane(
        "wire",
        "lane.wire",
        "operational",
        "ready",
        active ? "active" : "idle",
        active ? "wire.active" : "wire.idle",
        "/wire/demo/",
        [`peers=${c.peers_count}`, `pending=${c.wire_pending}`],
      ),
    );
  }

  // Property
  if (!c.property_ok || c.property_count === 0) {
    lanes.push(
      lane(
        "property_ops",
        "lane.property",
        c.property_ok ? "thin" : "missing",
        c.property_ok ? "ready" : "missing",
        "idle",
        c.property_ok ? "property.empty" : "property.missing",
        "/properties/",
        [],
      ),
    );
  } else {
    const active = c.property_due_p0 > 0;
    lanes.push(
      lane(
        "property_ops",
        "lane.property",
        "operational",
        "ready",
        active ? "active" : "idle",
        active ? "property.active" : "property.idle",
        "/properties/",
        c.property_signals,
      ),
    );
  }

  return lanes;
}

export function buildModuleMaturityPanel(): ModuleMaturityPanel {
  const modules = collectModules();
  const enabled = modules.filter((m) => m.enabled);
  const risks = modules.filter((m) => m.risk);
  const risk_skeleton_count = risks.filter(
    (r) => r.risk_severity === "skeleton_enabled",
  ).length;
  const risk_activation_count = risks.filter(
    (r) => r.risk_severity === "activation_enabled",
  ).length;
  const summary = {
    catalog_total: modules.length,
    installed: modules.filter((m) => m.installed).length,
    enabled: enabled.length,
    enabled_production_ready: enabled.filter((m) => m.tier === "production_ready")
      .length,
    enabled_activation_ready: enabled.filter((m) => m.tier === "activation_ready")
      .length,
    enabled_skeleton: enabled.filter((m) => m.tier === "skeleton").length,
    risk_count: risks.length,
    risk_skeleton_count,
    risk_activation_count,
  };

  return moduleMaturityPanelSchema.parse({
    ok: true as const,
    tenant: getTenantId(),
    report_date: currentDate(),
    summary,
    lanes: collectLanes(),
    modules,
    risks,
  });
}
