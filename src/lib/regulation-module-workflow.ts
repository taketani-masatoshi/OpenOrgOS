/**
 * Module ↔ regulation workflow: classify (deterministic) + Work Order on activate.
 * LLM drafts only via the Work Order; humans approve tenant 施行文.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { CatalogRegulation } from "../../schemas/regulations-catalog.js";
import { handoffSchema } from "../../schemas/routing.js";
import {
  generateWorkOrderId,
  listWorkOrders,
  writeWorkOrderFiles,
} from "./escalate.js";
import { getRegulationTemplateAbsPath } from "./jurisdiction.js";
import { loadModuleManifest, type ModuleManifest } from "./modules.js";
import { REGULATION_FAMILIES } from "./regulation-module-contract.js";
import { getCatalogRegulation, loadRegulationsCatalog } from "./regulations.js";
import { getTenantId } from "./tenant.js";

export type RegulationActionKind =
  | "reuse"
  | "thicken"
  | "fork_family"
  | "new"
  | "none";

export interface RegulationPlanAction {
  kind: RegulationActionKind;
  regulationIds: string[];
  rationale: string;
  /** LLM may draft pack/tenant text; must not auto-apply as 施行. */
  llmDraftAllowed: boolean;
  /** Pack-relative draft scaffold for fork_family / thicken. */
  draftTemplate?: string;
}

export interface RegulationModulePlan {
  moduleId: string;
  actions: RegulationPlanAction[];
  /** Sibling family regs that must not be overwritten. */
  doNotMutateRegulationIds: string[];
  familyId?: string;
}

/** Subject prefix used for WO dedupe on re-activate. */
export const REGULATION_WO_SUBJECT_PREFIX = "Module regulation workflow:";

export function regulationWorkflowSubject(moduleId: string): string {
  return `${REGULATION_WO_SUBJECT_PREFIX} ${moduleId}`;
}

const STUB_LINE_THRESHOLD = 40;

function templateBody(reg: CatalogRegulation): string | null {
  const abs = getRegulationTemplateAbsPath(reg.template);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf-8");
}

function templateLineCount(body: string): number {
  return body.split("\n").length;
}

function countArticles(body: string): number {
  const matches = body.match(/^## 第\d+条/gm);
  return matches?.length ?? 0;
}

function hasAnnex(body: string): boolean {
  return /^## 別紙/m.test(body);
}

/** Thin stub: short file, or only purpose/scope/responsibility without annex. */
export function isThinStubTemplate(body: string): boolean {
  const lines = templateLineCount(body);
  if (lines >= 0 && lines < STUB_LINE_THRESHOLD) return true;
  const articles = countArticles(body);
  if (articles > 0 && articles <= 3 && !hasAnnex(body)) return true;
  const stubOnly =
    /第1条（目的）/.test(body) &&
    /第2条（適用範囲）/.test(body) &&
    /第3条（責任）/.test(body) &&
    articles <= 3;
  return stubOnly;
}

function isThinStub(reg: CatalogRegulation): boolean {
  const body = templateBody(reg);
  if (body == null) return false;
  return isThinStubTemplate(body);
}

function regsBoundToModule(moduleId: string, catalog: CatalogRegulation[]): CatalogRegulation[] {
  return catalog.filter((r) => {
    const b = r.binds_to;
    if (b.type === "module") return b.module_id === moduleId;
    if (b.type === "module_any") return b.module_ids.includes(moduleId);
    return false;
  });
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function resolveFamilyContext(
  moduleId: string,
  manifest: ModuleManifest | null
): {
  familyId?: string;
  role?: "owner" | "sibling";
  sourceRegs: string[];
  draftTemplate?: string;
} {
  const declared = manifest?.regulation_family;
  if (declared?.id && REGULATION_FAMILIES[declared.id]) {
    const fam = REGULATION_FAMILIES[declared.id]!;
    const role =
      declared.role ??
      (fam.ownerModuleIds.includes(moduleId) ? "owner" : "sibling");
    return {
      familyId: declared.id,
      role,
      sourceRegs: uniqueIds([
        ...fam.sourceRegs,
        ...(declared.do_not_mutate ?? []),
      ]),
      draftTemplate: fam.draftTemplate,
    };
  }

  for (const [familyId, fam] of Object.entries(REGULATION_FAMILIES)) {
    if (fam.ownerModuleIds.includes(moduleId)) {
      return {
        familyId,
        role: "owner",
        sourceRegs: [...fam.sourceRegs],
        draftTemplate: fam.draftTemplate,
      };
    }
    if (
      fam.moduleIdHint.test(moduleId) ||
      fam.moduleIdHint.test(manifest?.notes ?? "")
    ) {
      return {
        familyId,
        role: "sibling",
        sourceRegs: [...fam.sourceRegs],
        draftTemplate: fam.draftTemplate,
      };
    }
  }
  return { sourceRegs: [] };
}

/**
 * Deterministic classification for a catalog module id.
 * Does not write tenant files.
 */
export function planRegulationForModule(moduleId: string): RegulationModulePlan {
  const manifest = loadModuleManifest(moduleId);
  const catalog = loadRegulationsCatalog().regulations;
  const actions: RegulationPlanAction[] = [];
  const doNotMutateRegulationIds: string[] = [];
  const familyCtx = resolveFamilyContext(moduleId, manifest);

  if (!manifest) {
    if (familyCtx.role === "sibling" && familyCtx.familyId) {
      for (const id of familyCtx.sourceRegs) {
        if (getCatalogRegulation(id)) doNotMutateRegulationIds.push(id);
      }
      return {
        moduleId,
        familyId: familyCtx.familyId,
        actions: [
          {
            kind: "fork_family",
            regulationIds: [...familyCtx.sourceRegs],
            rationale: `Family ${familyCtx.familyId}: draft sibling REG from source regs — do not overwrite owners. Manifest still missing.`,
            llmDraftAllowed: true,
            draftTemplate: familyCtx.draftTemplate,
          },
        ],
        doNotMutateRegulationIds: uniqueIds(doNotMutateRegulationIds),
      };
    }
    return {
      moduleId,
      actions: [
        {
          kind: "none",
          regulationIds: [],
          rationale: `manifest not found for ${moduleId}`,
          llmDraftAllowed: false,
        },
      ],
      doNotMutateRegulationIds,
    };
  }

  const required = manifest.required_regulations ?? [];
  const optional = manifest.optional_regulations ?? [];
  const declared = uniqueIds([...required, ...optional]);

  if (declared.length) {
    actions.push({
      kind: "reuse",
      regulationIds: declared,
      rationale:
        required.length > 0
          ? `manifest required/optional references: enable and seed (${required.join(", ") || "—"} required)`
          : `manifest optional references only: ${optional.join(", ")}`,
      llmDraftAllowed: false,
    });
  }

  const bound = regsBoundToModule(moduleId, catalog);
  const thinBound = bound.filter(isThinStub);
  if (thinBound.length) {
    actions.push({
      kind: "thicken",
      regulationIds: thinBound.map((r) => r.id),
      rationale:
        `module-bound template(s) look like stubs (short file, ≤3 articles without 別紙, or purpose/scope/responsibility only); thicken pack template before tenant 施行`,
      llmDraftAllowed: true,
    });
  }

  if (familyCtx.role === "sibling" && familyCtx.familyId) {
    for (const id of familyCtx.sourceRegs) {
      if (getCatalogRegulation(id)) doNotMutateRegulationIds.push(id);
    }
    actions.push({
      kind: "fork_family",
      regulationIds: [...familyCtx.sourceRegs],
      rationale:
        `Family ${familyCtx.familyId}: quality-system vocabulary may overlap an owner module, but legal duties differ. ` +
        `Draft a sibling REG or annex using ${familyCtx.draftTemplate ?? "family FORK-DRAFT"}; ` +
        `do NOT merge into or overwrite ${familyCtx.sourceRegs.join(", ")} tenant 施行文.`,
      llmDraftAllowed: true,
      draftTemplate: familyCtx.draftTemplate,
    });
  }

  const needsNewHint =
    declared.length === 0 &&
    bound.length === 0 &&
    familyCtx.role !== "sibling" &&
    /bank|payroll|tax|invoice|refund|permit|privacy|social.?insurance/i.test(moduleId);

  if (needsNewHint) {
    actions.push({
      kind: "new",
      regulationIds: [],
      rationale:
        "module id suggests cash/PII/permit risk but no REG is declared — add required_regulations or a risk-domain REG",
      llmDraftAllowed: true,
    });
  }

  if (actions.length === 0) {
    actions.push({
      kind: "none",
      regulationIds: [],
      rationale:
        manifest.notes?.trim() ||
        "no required/optional regulations and no module-bound catalog REG — document why in manifest.notes if intentional",
      llmDraftAllowed: false,
    });
  }

  return {
    moduleId,
    familyId: familyCtx.familyId,
    actions,
    doNotMutateRegulationIds: uniqueIds(doNotMutateRegulationIds),
  };
}

export function formatRegulationModulePlan(plan: RegulationModulePlan): string {
  const lines = [
    `# Regulation plan — \`${plan.moduleId}\``,
    plan.familyId ? `**Family:** \`${plan.familyId}\`` : "",
    "",
    "| kind | REG ids | LLM draft | draft scaffold | rationale |",
    "|------|---------|-----------|----------------|-----------|",
  ].filter((l) => l !== undefined);
  for (const a of plan.actions) {
    lines.push(
      `| ${a.kind} | ${a.regulationIds.join(", ") || "—"} | ${a.llmDraftAllowed ? "yes" : "no"} | ${a.draftTemplate ?? "—"} | ${a.rationale.replace(/\|/g, "/")} |`
    );
  }
  if (plan.doNotMutateRegulationIds.length) {
    lines.push(
      "",
      "**Do not mutate:** " + plan.doNotMutateRegulationIds.map((id) => `\`${id}\``).join(", ")
    );
  }
  lines.push(
    "",
    "LLM may draft only. Human approval required before tenant 施行. See `00-モジュール連動方針.md` §4."
  );
  return lines.join("\n");
}

function buildWorkOrderText(plan: RegulationModulePlan): {
  subject: string;
  background: string;
  requirements: string;
  deliverables: string[];
  acceptance_criteria: string[];
} {
  const md = formatRegulationModulePlan(plan);
  const scaffolds = plan.actions
    .map((a) => a.draftTemplate)
    .filter((x): x is string => Boolean(x));
  return {
    subject: regulationWorkflowSubject(plan.moduleId),
    background:
      "Module was activated (or regulation-plan requested). Classify regulations by risk domain; " +
      "LLM drafts pack/tenant text only. Do not treat medical-device QMS as cosmetics QMS.",
    requirements: [
      md,
      "",
      "## LLM constraints",
      "- Draft only: pack `template.md` proposals or tenant draft under docs/company/regulations/ with 草案 header",
      "- Never enable regulations.yaml or claim board approval",
      "- Never merge fork_family sources into one REG without an explicit new id / annex",
      plan.doNotMutateRegulationIds.length
        ? `- Forbidden overwrite: ${plan.doNotMutateRegulationIds.join(", ")}`
        : "",
      scaffolds.length
        ? `- Start from scaffold(s): ${scaffolds.map((s) => `\`${s}\``).join(", ")}`
        : "",
      "",
      "## Human steps after draft",
      "1. Legal/quality review",
      "2. Board (or delegated) approval",
      "3. Seed/enable 施行文 · `orgos validate`",
    ]
      .filter(Boolean)
      .join("\n"),
    deliverables: [
      "Classification table (reuse/thicken/fork_family/new/none)",
      "Draft template or 草案 MD (if llmDraftAllowed)",
      "Checklist for human approval — no silent apply",
    ],
    acceptance_criteria: [
      "No mutation of doNotMutateRegulationIds 施行文",
      "required_regulations satisfied or explicitly deferred with human note",
      "orgos validate clean after human enable+seed",
    ],
  };
}

export interface FileRegulationWorkflowWoOptions {
  dryRun?: boolean;
  fromAgent?: string;
  toAgent?: AgentId;
  /** When true (default), reuse pending WO with the same subject instead of filing again. */
  dedupe?: boolean;
}

export interface FileRegulationWorkflowWoResult {
  plan: RegulationModulePlan;
  workOrderId?: string;
  yamlPath?: string;
  mdPath?: string;
  promptPath?: string;
  skipped?: boolean;
  /** true when an existing pending WO was reused */
  deduped?: boolean;
}

function findPendingRegulationWorkflowWo(moduleId: string) {
  const subject = regulationWorkflowSubject(moduleId);
  return listWorkOrders("pending").find(
    (h) => h.subject === subject && h.to_agent === "compliance"
  );
}

/** File a Compliance Work Order for the regulation plan (LLM draft gate). */
export function fileRegulationWorkflowWorkOrder(
  moduleId: string,
  opts: FileRegulationWorkflowWoOptions = {}
): FileRegulationWorkflowWoResult {
  const plan = planRegulationForModule(moduleId);
  const text = buildWorkOrderText(plan);
  const dedupe = opts.dedupe !== false;

  if (opts.dryRun) {
    return { plan, skipped: true };
  }

  if (dedupe) {
    const existing = findPendingRegulationWorkflowWo(moduleId);
    if (existing) {
      return {
        plan,
        workOrderId: existing.id,
        skipped: true,
        deduped: true,
      };
    }
  }

  const id = generateWorkOrderId();
  const toAgent = (opts.toAgent ?? "compliance") as AgentId;
  const wo = handoffSchema.parse({
    id,
    created_at: new Date().toISOString(),
    from_agent: opts.fromAgent ?? "executive_steward",
    to_agent: toAgent,
    mode: "implement",
    task_type: "implement",
    access: { allowed: true, reason: "module regulation workflow" },
    context: {
      text: text.requirements,
      path: `steward/jurisdiction-packs/JP/regulations/00-モジュール連動方針.md`,
    },
    status: "pending",
    subject: text.subject,
    background: text.background,
    requirements: text.requirements,
    deliverables: text.deliverables,
    acceptance_criteria: text.acceptance_criteria,
    agent_prompt_path: join("prompts", `${id}_${toAgent}.md`),
    priority: "P2",
    tenant: getTenantId(),
  });

  const files = writeWorkOrderFiles(wo);
  return {
    plan,
    workOrderId: id,
    yamlPath: files.yamlPath,
    mdPath: files.mdPath,
    promptPath: files.promptPath,
  };
}
