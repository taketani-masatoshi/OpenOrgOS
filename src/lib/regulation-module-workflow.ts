/**
 * Module ↔ regulation workflow: classify (deterministic) + Work Order on activate.
 * LLM drafts only via the Work Order; humans approve tenant 施行文.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { CatalogRegulation } from "../../schemas/regulations-catalog.js";
import {
  generateWorkOrderId,
  writeWorkOrderFiles,
} from "./escalate.js";
import { getRegulationTemplateAbsPath } from "./jurisdiction.js";
import { loadModuleManifest } from "./modules.js";
import { getCatalogRegulation, loadRegulationsCatalog } from "./regulations.js";
import { getTenantId } from "./tenant.js";
import { handoffSchema } from "../../schemas/routing.js";

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
}

export interface RegulationModulePlan {
  moduleId: string;
  actions: RegulationPlanAction[];
  /** Sibling QMS-family regs that must not be overwritten. */
  doNotMutateRegulationIds: string[];
}

const STUB_LINE_THRESHOLD = 40;

/** Modules whose quality system resembles MD QMS but must fork, not merge. */
const QMS_FAMILY_FORK_MODULE_RE =
  /cosmetic|化粧品|quasi.?drug|医薬部外|otc.?drug|general.?drug/i;

const MEDICAL_DEVICE_QMS_REGS = ["REG-025", "REG-026"] as const;

function templateLineCount(reg: CatalogRegulation): number {
  const abs = getRegulationTemplateAbsPath(reg.template);
  if (!existsSync(abs)) return -1;
  return readFileSync(abs, "utf-8").split("\n").length;
}

function isThinStub(reg: CatalogRegulation): boolean {
  const n = templateLineCount(reg);
  return n >= 0 && n < STUB_LINE_THRESHOLD;
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

/**
 * Deterministic classification for a catalog module id.
 * Does not write tenant files.
 */
export function planRegulationForModule(moduleId: string): RegulationModulePlan {
  const manifest = loadModuleManifest(moduleId);
  const catalog = loadRegulationsCatalog().regulations;
  const actions: RegulationPlanAction[] = [];
  const doNotMutateRegulationIds: string[] = [];

  if (!manifest) {
    const forkHint = QMS_FAMILY_FORK_MODULE_RE.test(moduleId);
    if (forkHint) {
      for (const id of MEDICAL_DEVICE_QMS_REGS) {
        if (getCatalogRegulation(id)) doNotMutateRegulationIds.push(id);
      }
      return {
        moduleId,
        actions: [
          {
            kind: "fork_family",
            regulationIds: [...MEDICAL_DEVICE_QMS_REGS],
            rationale:
              "Module id suggests cosmetics/quasi-drug family; draft sibling REG — do not overwrite REG-025/026. Manifest still missing.",
            llmDraftAllowed: true,
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
      rationale: `module-bound template(s) are thin stubs (<${STUB_LINE_THRESHOLD} lines); thicken pack template before tenant 施行`,
      llmDraftAllowed: true,
    });
  }

  const looksLikeQmsCousin = QMS_FAMILY_FORK_MODULE_RE.test(moduleId) ||
    QMS_FAMILY_FORK_MODULE_RE.test(manifest.notes ?? "");
  if (looksLikeQmsCousin) {
    for (const id of MEDICAL_DEVICE_QMS_REGS) {
      if (getCatalogRegulation(id)) doNotMutateRegulationIds.push(id);
    }
    actions.push({
      kind: "fork_family",
      regulationIds: [...MEDICAL_DEVICE_QMS_REGS],
      rationale:
        "Quality-system vocabulary may overlap medical-device QMS/GVP, but legal duties differ. " +
        "Draft a sibling REG or annex; do NOT merge into or overwrite REG-025/026 tenant 施行文.",
      llmDraftAllowed: true,
    });
  }

  const needsNewHint =
    declared.length === 0 &&
    bound.length === 0 &&
    !looksLikeQmsCousin &&
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
    actions,
    doNotMutateRegulationIds: uniqueIds(doNotMutateRegulationIds),
  };
}

export function formatRegulationModulePlan(plan: RegulationModulePlan): string {
  const lines = [
    `# Regulation plan — \`${plan.moduleId}\``,
    "",
    "| kind | REG ids | LLM draft | rationale |",
    "|------|---------|-----------|-----------|",
  ];
  for (const a of plan.actions) {
    lines.push(
      `| ${a.kind} | ${a.regulationIds.join(", ") || "—"} | ${a.llmDraftAllowed ? "yes" : "no"} | ${a.rationale.replace(/\|/g, "/")} |`
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
  return {
    subject: `Module regulation workflow: ${plan.moduleId}`,
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
}

export interface FileRegulationWorkflowWoResult {
  plan: RegulationModulePlan;
  workOrderId?: string;
  yamlPath?: string;
  mdPath?: string;
  promptPath?: string;
  skipped?: boolean;
}

/** File a Compliance Work Order for the regulation plan (LLM draft gate). */
export function fileRegulationWorkflowWorkOrder(
  moduleId: string,
  opts: FileRegulationWorkflowWoOptions = {}
): FileRegulationWorkflowWoResult {
  const plan = planRegulationForModule(moduleId);
  const text = buildWorkOrderText(plan);

  if (opts.dryRun) {
    return { plan, skipped: true };
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
