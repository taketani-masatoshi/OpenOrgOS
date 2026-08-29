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
  carbonNeutralActionPlanSchema,
  carbonNeutralDeclarationSchema,
  type CarbonNeutralActionItem,
  type CarbonNeutralActionPlan,
  type CarbonNeutralDeclaration,
  type CarbonNeutralInterimTarget,
  type CarbonNeutralStatus,
} from "./schema.js";

export const MODULE_ID = "jp_carbon_neutral_2050";

const DECLARATION_FILE = "declaration.yaml";
const ACTION_PLAN_FILE = "action-plan.yaml";
const DECLARATION_TEMPLATE = "declaration-template.md";
/** Publication target declared by `seed/00-README.md`. */
const PUBLISHED_DOCUMENT = "docs/compliance/declarations/carbon-neutral-2050.md";

/** Statuses where the declaration text is externally committed. */
const COMMITTED_STATUSES = new Set<CarbonNeutralStatus>(["signed", "published"]);
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

function loadDeclaration(): { data: CarbonNeutralDeclaration; path: string } | null {
  return loadModuleDataFile(MODULE_ID, DECLARATION_FILE, carbonNeutralDeclarationSchema);
}

function loadActionPlan(): { data: CarbonNeutralActionPlan; path: string } | null {
  return loadModuleDataFile(MODULE_ID, ACTION_PLAN_FILE, carbonNeutralActionPlanSchema);
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

function isUnquantified(target: CarbonNeutralInterimTarget): boolean {
  return target.reduction_pct === null || target.reduction_pct === undefined;
}

function earliestInterimTargetYear(targets: CarbonNeutralInterimTarget[]): number | null {
  if (targets.length === 0) return null;
  return targets.reduce((earliest, target) => Math.min(earliest, target.year), targets[0].year);
}

function dueYear(item: CarbonNeutralActionItem): number {
  return Number(item.due.slice(0, 4));
}

function countByStatus(items: CarbonNeutralActionItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function orUnset(value: string | number | null | undefined): string {
  return value === null || value === undefined ? UNSET : String(value);
}

export function runCarbonNeutralShow(opts: { json?: boolean }): void {
  const declaration = loadDeclaration()?.data ?? null;
  const plan = loadActionPlan()?.data ?? null;
  const targets = declaration?.interim_targets ?? [];
  const items = plan?.items ?? [];
  const document = resolveDeclarationDocument();

  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    status: declaration?.status ?? null,
    signed_at: declaration?.signed_at ?? null,
    published_url: declaration?.published_url ?? null,
    baseline_year: declaration?.baseline_year ?? null,
    net_zero_year: declaration?.net_zero_year ?? null,
    scopes_in_scope: declaration?.scopes_in_scope ?? [],
    interim_targets: targets.length,
    unquantified_targets: targets.filter(isUnquantified).length,
    first_interim_target: earliestInterimTargetYear(targets),
    action_plan_as_of: plan?.as_of ?? null,
    action_items: items.length,
    open_action_items: items.filter((item) => OPEN_ACTION_STATUSES.has(item.status)).length,
    action_status: countByStatus(items),
    review_cycle: declaration?.review_cycle ?? null,
    next_review: declaration?.next_review ?? null,
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
      `declaration: ${declaration.status} · signed ${orUnset(declaration.signed_at)} · url ${orUnset(declaration.published_url)}`
    );
    console.log(
      `baseline ${declaration.baseline_year} → net zero ${declaration.net_zero_year} · scopes: ${declaration.scopes_in_scope.join(", ") || UNSET}`
    );
    console.log(
      `interim targets: ${summary.interim_targets} · first ${orUnset(summary.first_interim_target)} · unquantified ${summary.unquantified_targets}`
    );
    console.log(
      `review: ${declaration.review_cycle} · next review ${orUnset(declaration.next_review)}`
    );
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

export function runCarbonNeutralValidate(): void {
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
    `✓ ${MODULE_ID} — ${declaration?.interim_targets.length ?? 0} interim target(s) · ${plan?.items.length ?? 0} action item(s) OK`
  );
  for (const warning of warnings) console.log(`  ! ${warning}`);
  if (!isModuleEnabled(MODULE_ID)) {
    console.log("note: module not enabled in this tenant — catalog seed validated");
  }
}

function checkDeclaration(
  declaration: CarbonNeutralDeclaration,
  issues: string[],
  warnings: string[]
): void {
  if (declaration.module_id !== MODULE_ID) {
    issues.push(`${DECLARATION_FILE}: module_id ${declaration.module_id} != ${MODULE_ID}`);
  }
  if (declaration.baseline_year >= declaration.net_zero_year) {
    issues.push(
      `baseline_year ${declaration.baseline_year} must precede net_zero_year ${declaration.net_zero_year}`
    );
  }
  if (declaration.scopes_in_scope.length === 0) {
    issues.push("scopes_in_scope empty — declaration has no emission boundary");
  }
  if (declaration.interim_targets.length === 0) {
    issues.push("interim_targets empty — declaration has no measurable milestone");
  }

  const years = new Set<number>();
  for (const target of declaration.interim_targets) {
    if (years.has(target.year)) issues.push(`duplicate interim target year ${target.year}`);
    years.add(target.year);
    if (target.year <= declaration.baseline_year || target.year > declaration.net_zero_year) {
      issues.push(
        `interim target ${target.year} outside ${declaration.baseline_year}–${declaration.net_zero_year}`
      );
    }
    if (isUnquantified(target)) warnings.push(`interim target ${target.year}: reduction_pct unset`);
  }

  if (COMMITTED_STATUSES.has(declaration.status) && !declaration.signed_at) {
    issues.push(`status ${declaration.status} requires signed_at`);
  } else if (!COMMITTED_STATUSES.has(declaration.status)) {
    warnings.push(`status ${declaration.status} — declaration not signed`);
  }
  if (declaration.status === "published" && !declaration.published_url) {
    issues.push("status published requires published_url");
  }
  if (!declaration.next_review) {
    warnings.push(`next_review unset (review cycle: ${declaration.review_cycle})`);
  }
}

function checkActionPlan(
  plan: CarbonNeutralActionPlan,
  declaration: CarbonNeutralDeclaration | null,
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
  let unquantified = 0;
  for (const item of plan.items) {
    if (ids.has(item.id)) issues.push(`duplicate action item id ${item.id}`);
    ids.add(item.id);
    if (item.due < plan.as_of) {
      issues.push(`${item.id}: due ${item.due} precedes plan as_of ${plan.as_of}`);
    }
    if (item.expected_reduction_tco2e === null || item.expected_reduction_tco2e === undefined) {
      unquantified++;
    }
  }
  if (unquantified > 0) {
    warnings.push(`${unquantified} action item(s) missing expected_reduction_tco2e`);
  }

  const firstTarget = earliestInterimTargetYear(declaration?.interim_targets ?? []);
  if (firstTarget !== null && !plan.items.some((item) => dueYear(item) <= firstTarget)) {
    issues.push(`action plan has no item due by the first interim target (${firstTarget})`);
  }
}

export function runCarbonNeutralTargets(opts: { json?: boolean }): void {
  const declaration = loadDeclaration();
  const plan = loadActionPlan();
  if (!declaration || !plan) {
    console.error(`${MODULE_ID}: ${DECLARATION_FILE} / ${ACTION_PLAN_FILE} not found`);
    process.exit(1);
    return;
  }

  const targets = [...declaration.data.interim_targets].sort((a, b) => a.year - b.year);
  const items = [...plan.data.items].sort((a, b) => a.due.localeCompare(b.due));

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          module: MODULE_ID,
          baseline_year: declaration.data.baseline_year,
          net_zero_year: declaration.data.net_zero_year,
          as_of: plan.data.as_of,
          interim_targets: targets.map((target) => ({
            year: target.year,
            scope: target.scope,
            reduction_pct: target.reduction_pct ?? null,
            quantified: !isUnquantified(target),
          })),
          actions: items.map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            owner_role: item.owner_role,
            due: item.due,
            status: item.status,
            expected_reduction_tco2e: item.expected_reduction_tco2e ?? null,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Carbon neutral targets — ${MODULE_ID}\n`);
  console.log(
    `baseline ${declaration.data.baseline_year} → net zero ${declaration.data.net_zero_year}\n`
  );

  console.log("## Interim targets\n");
  if (!targets.length) console.log("(no interim targets declared)");
  for (const target of targets) {
    const reduction = isUnquantified(target) ? "reduction 未算定" : `△${target.reduction_pct}%`;
    const notes = target.notes ? ` · ${target.notes}` : "";
    console.log(`- ${target.year} · ${target.scope} · ${reduction}${notes}`);
  }

  console.log(`\n## Action plan (as of ${plan.data.as_of})\n`);
  if (!items.length) console.log("(no action items)");
  for (const item of items) {
    const reduction =
      item.expected_reduction_tco2e === null || item.expected_reduction_tco2e === undefined
        ? "reduction 未算定"
        : `${item.expected_reduction_tco2e} tCO2e`;
    console.log(
      `- ${item.id} · due ${item.due} · ${item.title} (${item.category} · ${item.owner_role}) · ${item.status} · ${reduction}`
    );
  }

  const open = items.filter((item) => OPEN_ACTION_STATUSES.has(item.status)).length;
  console.log(`\n${targets.length} interim target(s) · ${items.length} action item(s) · ${open} open`);
}
