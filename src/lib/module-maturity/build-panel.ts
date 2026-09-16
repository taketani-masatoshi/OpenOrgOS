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
import { buildPropertyOpsDashboard } from "../property-ops/build-dashboard.js";
import { buildSecretaryWorkbench } from "../secretary-workbench/build-workbench.js";
import { buildTaskView } from "../tasks/task-view.js";
import { getTenantId, getTenantDir } from "../tenant.js";
import { currentDate } from "../utils.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
  return undefined;
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
    rows.push({
      id,
      label: moduleLabel(id),
      tier,
      installed,
      enabled,
      risk,
      notes,
      href: moduleHref(id, enabled),
    });
  }
  rows.sort((a, b) => {
    if (a.risk !== b.risk) return a.risk ? -1 : 1;
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return rows;
}

function lane(
  id: CoreLane["id"],
  label: string,
  level: LaneLevel,
  summary: string,
  href: string,
  signals: string[],
): CoreLane {
  return { id, label, level, summary, href, signals };
}

function collectLanes(): CoreLane[] {
  const lanes: CoreLane[] = [];

  let wb: ReturnType<typeof buildSecretaryWorkbench> | null = null;
  try {
    wb = buildSecretaryWorkbench();
  } catch {
    wb = null;
  }

  if (wb) {
    const signals = [
      `mail=${wb.mail.length}`,
      `drafts=${wb.drafts.length}`,
      `tasks=${wb.tasks.length}`,
      `approvals=${wb.approvals.length}`,
    ];
    const hasOps =
      wb.mail.length + wb.drafts.length + wb.tasks.length + wb.approvals.length >
      0;
    lanes.push(
      lane(
        "secretary",
        "秘書ワークベンチ",
        hasOps ? "operational" : "thin",
        hasOps
          ? "受信・下書き・タスク・承認を一画面で集約"
          : "画面はあるがキューが空（または未取込）",
        "/secretary/workbench/",
        signals,
      ),
    );

    const mailN = wb.mail.length;
    const draftN = wb.drafts.length;
    const mailLevel: LaneLevel =
      mailN > 0 && draftN > 0
        ? "closed"
        : mailN > 0 || draftN > 0
          ? "operational"
          : "thin";
    lanes.push(
      lane(
        "mail",
        "メール運用",
        mailLevel,
        mailLevel === "closed"
          ? "受信と下書きが両方つながっている"
          : mailLevel === "operational"
            ? "受信または下書きが動いている"
            : "MailWorkbench / triage 面はあるが件数ゼロ",
        "/wire/",
        [`mail=${mailN}`, `drafts=${draftN}`],
      ),
    );
  } else {
    lanes.push(
      lane(
        "secretary",
        "秘書ワークベンチ",
        "missing",
        "Workbench を合成できない",
        "/secretary/workbench/",
        [],
      ),
    );
    lanes.push(
      lane("mail", "メール運用", "missing", "メール面を評価できない", "/wire/", []),
    );
  }

  // Task
  try {
    const view = buildTaskView();
    const open = view.counts.open;
    const p0 = view.counts.p0;
    const candidates = view.candidates.length;
    const mirrored = view.tasks.filter((t) => t.links?.asana_task_gid).length;
    let level: LaneLevel = "thin";
    if (open > 0 && (mirrored > 0 || candidates > 0)) level = "closed";
    else if (open > 0 || candidates > 0) level = "operational";
    lanes.push(
      lane(
        "task",
        "タスク正本",
        level,
        level === "closed"
          ? "tasks.yaml 正本と候補／Asana 写しが接続"
          : level === "operational"
            ? "正本または候補に未完了がある"
            : "正本は読めるが未完了が空",
        "/secretary/workbench/",
        [`open=${open}`, `p0=${p0}`, `candidates=${candidates}`, `asana=${mirrored}`],
      ),
    );
  } catch {
    lanes.push(
      lane(
        "task",
        "タスク正本",
        "missing",
        "tasks.yaml を読めない",
        "/secretary/workbench/",
        [],
      ),
    );
  }

  // Wire
  try {
    const peersPath = join(getTenantDir(), "data", "protocol", "peers.yaml");
    const hasPeers = existsSync(peersPath);
    const level: LaneLevel = hasPeers ? "thin" : "missing";
    lanes.push(
      lane(
        "wire",
        "Wire（組織間）",
        level,
        hasPeers
          ? "peers.yaml あり。デモ導線は /wire/demo/"
          : "peers.yaml が無くデモ導線が弱い",
        "/wire/demo/",
        [hasPeers ? "peers=present" : "peers=missing"],
      ),
    );
  } catch {
    lanes.push(
      lane("wire", "Wire（組織間）", "missing", "Wire 状態を評価できない", "/wire/demo/", []),
    );
  }

  // Property ops
  try {
    const dash = buildPropertyOpsDashboard();
    const dueP0 = dash.properties.reduce((s, p) => s + p.due_p0, 0);
    const level: LaneLevel =
      dash.properties.length > 0
        ? dueP0 > 0
          ? "operational"
          : "thin"
        : "missing";
    lanes.push(
      lane(
        "property_ops",
        "物件運営",
        level,
        dash.properties.length > 0
          ? `物件 ${dash.properties.length} 件 · P0 ${dueP0}`
          : "物件カードが無い",
        "/properties/",
        dash.properties.map((p) => `${p.property_id}:${p.due_p0}`),
      ),
    );
  } catch {
    lanes.push(
      lane(
        "property_ops",
        "物件運営",
        "missing",
        "Property Ops を合成できない",
        "/properties/",
        [],
      ),
    );
  }

  return lanes;
}

export function buildModuleMaturityPanel(): ModuleMaturityPanel {
  const modules = collectModules();
  const enabled = modules.filter((m) => m.enabled);
  const risks = modules.filter((m) => m.risk);
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
