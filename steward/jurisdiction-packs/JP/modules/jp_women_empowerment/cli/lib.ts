import { existsSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import {
  isModuleEnabled,
  loadModuleDataFile,
  resolveModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { resolveTenantPath } from "../../../../../../src/lib/utils.js";
import {
  womenEmpowermentActionPlanSchema,
  womenEmpowermentDeclarationSchema,
  type WomenEmpowermentActionItem,
  type WomenEmpowermentActionPlan,
  type WomenEmpowermentDeclaration,
  type WomenEmpowermentTarget,
} from "./schema.js";

export const MODULE_ID = "jp_women_empowerment";

const DECLARATION_FILE = "declaration.yaml";
const ACTION_PLAN_FILE = "action-plan.yaml";
const DECLARATION_TEMPLATE = "declaration-template.md";
/** Publication target declared by `seed/00-README.md`. */
const PUBLISHED_DOCUMENT = "docs/compliance/declarations/women-empowerment.md";

const OPEN_ACTION_STATUSES = new Set(["planned", "in_progress"]);
const UNSET = "—";

type DocumentSource = "published" | "tenant" | "seed";

interface DeclarationDocument {
  source: DocumentSource;
  path: string;
}

/**
 * The declaration text follows the same tenant-then-seed precedence as the
 * YAML sources, with the published compliance document taking priority.
 */
function resolveDeclarationDocument(): DeclarationDocument | null {
  const candidates: Array<[DocumentSource, string]> = [
    ["published", resolveTenantPath(PUBLISHED_DOCUMENT)],
    ["tenant", resolveModuleDataFile(MODULE_ID, DECLARATION_TEMPLATE)],
    ["tenant", resolveModuleDataFile(MODULE_ID, `${DECLARATION_TEMPLATE}.example`)],
    ["seed", join(getModuleSeedDir(MODULE_ID), DECLARATION_TEMPLATE)],
    ["seed", join(getModuleSeedDir(MODULE_ID), `${DECLARATION_TEMPLATE}.example`)],
  ];
  for (const [source, path] of candidates) {
    if (existsSync(path)) return { source, path };
  }
  return null;
}

function loadDeclaration(): { data: WomenEmpowermentDeclaration; path: string } | null {
  return loadModuleDataFile(MODULE_ID, DECLARATION_FILE, womenEmpowermentDeclarationSchema);
}

function loadActionPlan(): { data: WomenEmpowermentActionPlan; path: string } | null {
  return loadModuleDataFile(MODULE_ID, ACTION_PLAN_FILE, womenEmpowermentActionPlanSchema);
}

function describeLoadFailure(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function loadChecked<T>(
  load: () => { data: T; path: string } | null,
  filename: string,
  issues: string[]
): T | null {
  try {
    const loaded = load();
    if (!loaded) {
      issues.push(`${filename} missing`);
      return null;
    }
    return loaded.data;
  } catch (error) {
    issues.push(`${filename} invalid — ${describeLoadFailure(error)}`);
    return null;
  }
}

function isUnset(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}

/** A KPI only steers the plan once both its starting point and goal are known. */
function isKpiIncomplete(target: WomenEmpowermentTarget): boolean {
  return isUnset(target.baseline) || isUnset(target.target);
}

function countByStatus(items: WomenEmpowermentActionItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function orUnset(value: string | number | null | undefined): string {
  return value === null || value === undefined ? UNSET : String(value);
}

function formatKpiValue(value: number | null | undefined, unit: string): string {
  return isUnset(value) ? "未設定" : `${value}${unit}`;
}

export function runWomenEmpowermentShow(opts: { json?: boolean }): void {
  const declaration = loadDeclaration()?.data ?? null;
  const plan = loadActionPlan()?.data ?? null;
  const targets = declaration?.targets ?? [];
  const items = plan?.items ?? [];
  const document = resolveDeclarationDocument();

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    plan_type: declaration?.plan_type ?? null,
    status: declaration?.status ?? null,
    published_at: declaration?.published_at ?? null,
    plan_period: declaration?.plan_period ?? null,
    declaration_types: declaration?.declaration_types ?? [],
    kpis: targets.length,
    incomplete_kpis: targets.filter(isKpiIncomplete).length,
    action_plan_as_of: plan?.as_of ?? null,
    action_items: items.length,
    open_action_items: items.filter((item) => OPEN_ACTION_STATUSES.has(item.status)).length,
    action_status: countByStatus(items),
    review_cycle: declaration?.review_cycle ?? null,
    document,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`# ${MODULE_ID}\n`);
  if (!declaration) {
    console.log(`declaration: ${DECLARATION_FILE} not found`);
  } else {
    console.log(
      `declaration: ${declaration.plan_type} · ${declaration.status} · published ${orUnset(declaration.published_at)}`
    );
    console.log(
      `plan period: ${declaration.plan_period.from} → ${declaration.plan_period.to} · review ${declaration.review_cycle}`
    );
    console.log(`declaration types: ${declaration.declaration_types.join(", ") || UNSET}`);
    console.log(`KPIs: ${summary.kpis} · 未設定 ${summary.incomplete_kpis}`);
  }
  if (!plan) {
    console.log(`action plan: ${ACTION_PLAN_FILE} not found`);
  } else {
    const breakdown = Object.entries(summary.action_status)
      .map(([status, count]) => `${status} ${count}`)
      .join(" · ");
    console.log(
      `action items: ${summary.action_items} · open ${summary.open_action_items} (${breakdown || "none"}) · as of ${plan.as_of}`
    );
  }
  console.log(`document: ${document ? document.source : "not found"}`);
}

export function runWomenEmpowermentValidate(): void {
  const issues: string[] = [];
  const warnings: string[] = [];
  const declaration = loadChecked(loadDeclaration, DECLARATION_FILE, issues);
  const plan = loadChecked(loadActionPlan, ACTION_PLAN_FILE, issues);

  if (declaration) checkDeclaration(declaration, issues, warnings);
  if (plan) checkActionPlan(plan, declaration, issues, warnings);

  const document = resolveDeclarationDocument();
  if (!document) {
    issues.push(`${DECLARATION_TEMPLATE} not found in tenant data or module seed`);
  } else if (document.source === "seed") {
    warnings.push("declaration document is the module seed copy — not deployed to tenant docs");
  }

  if (issues.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
    return;
  }

  console.log(
    `✓ ${MODULE_ID} — ${declaration?.targets.length ?? 0} KPI(s) · ${plan?.items.length ?? 0} action item(s) OK`
  );
  for (const warning of warnings) console.log(`  ! ${warning}`);
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

function checkDeclaration(
  declaration: WomenEmpowermentDeclaration,
  issues: string[],
  warnings: string[]
): void {
  if (declaration.module_id !== MODULE_ID) {
    issues.push(`${DECLARATION_FILE}: module_id ${declaration.module_id} != ${MODULE_ID}`);
  }
  if (declaration.plan_period.from >= declaration.plan_period.to) {
    issues.push(
      `plan_period.from ${declaration.plan_period.from} must precede to ${declaration.plan_period.to}`
    );
  }
  if (declaration.declaration_types.length === 0) {
    issues.push("declaration_types empty — 宣言種別が未指定");
  }
  if (declaration.targets.length === 0) {
    issues.push("targets empty — 行動計画に数値目標がない");
  }

  const ids = new Set<string>();
  for (const target of declaration.targets) {
    if (ids.has(target.id)) issues.push(`duplicate KPI id ${target.id}`);
    ids.add(target.id);
    if (isKpiIncomplete(target)) {
      warnings.push(
        `${target.id} ${target.name}: baseline ${formatKpiValue(target.baseline, target.unit)} · target ${formatKpiValue(target.target, target.unit)}`
      );
    }
  }

  if (declaration.status === "published" && !declaration.published_at) {
    issues.push("status published requires published_at");
  } else if (declaration.status !== "published") {
    warnings.push(`status ${declaration.status} — 行動計画は未公表`);
  }
}

function checkActionPlan(
  plan: WomenEmpowermentActionPlan,
  declaration: WomenEmpowermentDeclaration | null,
  issues: string[],
  warnings: string[]
): void {
  if (plan.module_id !== MODULE_ID) {
    issues.push(`${ACTION_PLAN_FILE}: module_id ${plan.module_id} != ${MODULE_ID}`);
  }
  if (plan.items.length === 0) {
    issues.push("action-plan.yaml has no items");
  }

  const ids = new Set<string>();
  for (const item of plan.items) {
    if (ids.has(item.id)) issues.push(`duplicate action item id ${item.id}`);
    ids.add(item.id);
    if (item.due < plan.as_of) {
      issues.push(`${item.id}: due ${item.due} precedes plan as_of ${plan.as_of}`);
    }
  }

  if (!declaration) return;

  const { from, to } = declaration.plan_period;
  if (plan.as_of < from || plan.as_of > to) {
    issues.push(`action plan as_of ${plan.as_of} outside plan period ${from}–${to}`);
  }
  for (const item of plan.items) {
    if (item.due < from || item.due > to) {
      issues.push(`${item.id}: due ${item.due} outside plan period ${from}–${to}`);
    }
  }
  if (plan.items.length > 0 && plan.items.every((item) => item.status === "cancelled")) {
    warnings.push("all action items cancelled — 計画期間内の実施施策がない");
  }
}

export function runWomenEmpowermentKpi(opts: { json?: boolean }): void {
  const declaration = loadDeclaration();
  const plan = loadActionPlan();
  if (!declaration || !plan) {
    console.error(`${MODULE_ID}: ${DECLARATION_FILE} / ${ACTION_PLAN_FILE} not found`);
    process.exit(1);
    return;
  }

  const targets = declaration.data.targets;
  const items = [...plan.data.items].sort((a, b) => a.due.localeCompare(b.due));
  const incomplete = targets.filter(isKpiIncomplete);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          module: MODULE_ID,
          status: declaration.data.status,
          plan_period: declaration.data.plan_period,
          as_of: plan.data.as_of,
          kpis: targets.map((target) => ({
            id: target.id,
            name: target.name,
            unit: target.unit,
            baseline: target.baseline ?? null,
            target: target.target ?? null,
            unset: isKpiIncomplete(target),
          })),
          incomplete_kpis: incomplete.length,
          actions: items.map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            owner_role: item.owner_role,
            due: item.due,
            status: item.status,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Women empowerment KPIs — ${MODULE_ID}\n`);
  console.log(
    `plan period ${declaration.data.plan_period.from} → ${declaration.data.plan_period.to} · ${declaration.data.status}\n`
  );

  console.log("## KPI targets\n");
  if (!targets.length) console.log("(no KPI targets declared)");
  for (const target of targets) {
    const baseline = formatKpiValue(target.baseline, target.unit);
    const goal = formatKpiValue(target.target, target.unit);
    const flag = isKpiIncomplete(target) ? " ⚠ 未設定" : "";
    console.log(`- ${target.id} · ${target.name} · baseline ${baseline} → target ${goal}${flag}`);
  }
  console.log(`\n${incomplete.length}/${targets.length} KPI(s) with unset baseline or target`);

  console.log(`\n## Action items (as of ${plan.data.as_of})\n`);
  if (!items.length) console.log("(no action items)");
  for (const item of items) {
    console.log(
      `- ${item.id} · due ${item.due} · ${item.title} (${item.category} · ${item.owner_role}) · ${item.status}`
    );
  }
}
