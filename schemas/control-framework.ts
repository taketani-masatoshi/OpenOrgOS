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
]);

export const controlCheckType = z.enum(["policy", "record", "operation"]);

export const isoRefSchema = z.object({
  standard: z.string().min(1),
  clause: z.string().min(1),
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
  check_type: controlCheckType,
  target_maturity: controlTargetMaturity.default("L2"),
});

export const controlMapFileSchema = z.object({
  version: z.string().default("1"),
  standard: z.string().min(1),
  controls: z.array(controlDefinitionSchema),
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
export type ControlDefinition = z.output<typeof controlDefinitionSchema>;
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
