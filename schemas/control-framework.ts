import { z } from "zod";
import { agentId } from "./classification.js";

export const controlMaturity = z.enum(["L0", "L1", "L2", "L3", "L4"]);

export const controlTargetMaturity = z.enum(["L2", "L3", "L4"]);

export const controlDomain = z.enum([
  "governance",
  "quality",
  "security",
  "privacy",
  "environment",
  "safety",
  "continuity",
  "audit",
  "operations",
  "compliance_ms",
]);

export const controlCheckType = z.enum(["policy", "record", "operation"]);

/**
 * How evidence_paths are satisfied.
 * `any` — one existing path is enough (shared artefacts: audit plan, MR minutes).
 * `all` — every path must exist (per-standard artefacts folded into one control:
 * each enabled standard still owes its own risk register, policy, scope statement).
 */
export const controlEvidenceMode = z.enum(["any", "all"]);

/**
 * Management-system work types shared across standards.
 * Keyed by the work itself, not by clause number: the same work is 9.2 under
 * Annex SL, 8.2.4 under ISO 13485, and renumbered again on each revision.
 */
export const controlWork = z.enum([
  "scope",
  "policy",
  "risk_approach",
  "objectives_monitoring",
  "competence",
  "documented_information",
  "operation",
  "internal_audit",
  "management_review",
  "corrective_action",
]);

/**
 * Order in which a tenant should establish the control, declared by the pack
 * rather than inferred: with a whole standard newly enabled, almost everything
 * is open at once, and only the pack author knows what the rest depends on.
 *
 * P1 — protects people or is legally required, and cannot wait.
 * P2 — the management-system step other controls build on.
 * P3 — refinement, reporting, and continual improvement.
 */
export const controlPriority = z.enum(["P1", "P2", "P3"]);

export const isoRefSchema = z.object({
  standard: z.string().min(1),
  clause: z.string().min(1),
  /** Edition year, stamped by the loader from catalog.yaml. */
  edition: z.string().optional(),
  /**
   * Date the clause number was checked against the purchased standard text.
   * Absent means unverified: ISO text is not redistributable, so a pack ships
   * the mapping as a working assumption until a licensed copy confirms it.
   */
  verified_on: z.string().optional(),
  /** Who checked it, and against which copy. */
  verified_by: z.string().optional(),
});

export const guidanceRefSchema = z.object({
  standard: z.string().min(1),
  note: z.string().optional(),
});

export const regRefSchema = z.object({
  reg_id: z.string().min(1),
  articles: z.array(z.string()).optional(),
});

export const controlDefinitionSchema = z.object({
  id: z.string().regex(/^CTL-/),
  title: z.string().min(1),
  domain: controlDomain,
  iso_refs: z.array(isoRefSchema).min(1),
  reg_refs: z.array(regRefSchema).default([]),
  primary_agent: agentId,
  secondary_agents: z.array(agentId).optional(),
  evidence_paths: z.array(z.string()).default([]),
  evidence_mode: controlEvidenceMode.default("any"),
  priority: controlPriority.default("P3"),
  check_type: controlCheckType,
  target_maturity: controlTargetMaturity.default("L2"),
});

/** Binds one standard clause to a shared core work type. */
export const coreBindingSchema = z.object({
  work: controlWork,
  clause: z.string().min(1),
  /** See `isoRefSchema.verified_on` — absent means the clause is unverified. */
  verified_on: z.string().optional(),
  verified_by: z.string().optional(),
  /** Evidence paths specific to this standard, unioned with the core defaults. */
  evidence_paths: z.array(z.string()).default([]),
  reg_refs: z.array(regRefSchema).default([]),
});

/**
 * An empty YAML block (`controls:` followed only by comments) parses to null,
 * which a plain `.default([])` would reject. A pack that only carries
 * core_bindings is legitimate, so treat null as empty.
 */
function optionalList<T extends z.ZodTypeAny>(item: T) {
  return z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);
}

export const controlMapFileSchema = z.object({
  version: z.string().default("1"),
  standard: z.string().min(1),
  notes: z.string().optional(),
  core_bindings: optionalList(coreBindingSchema),
  controls: optionalList(controlDefinitionSchema),
});

/** A core control has no fixed clause: the loader derives iso_refs from bindings. */
export const coreControlDefinitionSchema = controlDefinitionSchema
  .omit({ iso_refs: true })
  .extend({
    work: controlWork,
    /** Per-standard control ids replaced by this core control. */
    supersedes: z.array(z.string().regex(/^CTL-/)).default([]),
    /** Guidance standards that describe this work (ISO 31000, ISO 19011, ...). */
    guidance_refs: z.array(guidanceRefSchema).default([]),
  });

export const coreControlMapFileSchema = z.object({
  version: z.string().default("1"),
  controls: z.array(coreControlDefinitionSchema),
});

export const coreProfileFileSchema = z.object({
  version: z.string().default("1"),
  profiles: z.record(z.string(), z.array(coreBindingSchema)),
});

export const tenantControlStatusSchema = z.object({
  id: z.string().regex(/^CTL-/),
  maturity: controlMaturity,
  last_reviewed: z.string().optional(),
  notes: z.string().optional(),
});

export const tenantControlsFileSchema = z.object({
  version: z.string().default("1"),
  as_of: z.string().optional(),
  controls: z.array(tenantControlStatusSchema),
});

export const maturityLevelSchema = z.object({
  level: controlMaturity,
  label: z.string(),
  meaning: z.string(),
});

export const maturityModelSchema = z.object({
  version: z.string(),
  levels: z.array(maturityLevelSchema),
});

export const agentRoleEntrySchema = z.object({
  agent: agentId,
  domains: z.array(controlDomain),
  description: z.string().optional(),
});

export const agentRolesSchema = z.object({
  version: z.string(),
  roles: z.array(agentRoleEntrySchema),
});

export const regBindingEntrySchema = z.object({
  reg_id: z.string().min(1),
  control_ids: z.array(z.string()).min(1),
  articles: z.array(z.string()).optional(),
});

export const regBindingsSchema = z.object({
  version: z.string(),
  jurisdiction: z.string(),
  bindings: z.array(regBindingEntrySchema),
});

export type ControlMaturity = z.output<typeof controlMaturity>;
export type ControlEvidenceMode = z.output<typeof controlEvidenceMode>;
export type ControlWork = z.output<typeof controlWork>;
export type IsoRef = z.output<typeof isoRefSchema>;
export type CoreBinding = z.output<typeof coreBindingSchema>;
export type ControlPriority = z.output<typeof controlPriority>;
export type ControlDefinition = z.output<typeof controlDefinitionSchema>;
export type CoreControlDefinition = z.output<typeof coreControlDefinitionSchema>;
export type CoreControlMapFile = z.output<typeof coreControlMapFileSchema>;
export type CoreProfileFile = z.output<typeof coreProfileFileSchema>;
export type ControlMapFile = z.output<typeof controlMapFileSchema>;
export type TenantControlStatus = z.output<typeof tenantControlStatusSchema>;
export type TenantControlsFile = z.output<typeof tenantControlsFileSchema>;
export type MaturityModel = z.output<typeof maturityModelSchema>;
export type AgentRoles = z.output<typeof agentRolesSchema>;
export type RegBindings = z.output<typeof regBindingsSchema>;

export const CONTROL_GAP_TYPES = [
  "reg_not_effective",
  "doc_missing",
  "maturity_below_target",
  "evidence_stale",
] as const;

export type ControlGapType = (typeof CONTROL_GAP_TYPES)[number];

export interface ControlGapRow {
  control_id: string;
  title: string;
  gap_type: ControlGapType;
  detail: string;
  primary_agent: z.output<typeof agentId>;
}

export interface EffectiveControl extends ControlDefinition {
  in_scope: boolean;
  tenant_maturity: ControlMaturity;
  last_reviewed?: string;
  notes?: string;
}
