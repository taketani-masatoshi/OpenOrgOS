import { z } from "zod";
import { dateString } from "./common.js";
import { agentId } from "./classification.js";

export const workKindSchema = z.enum([
  "fact_live",
  "fact_gap",
  "human_act",
  "aia_draft",
  "judgment",
  "unknown",
]);

export const towerClassificationSchema = z.object({
  kind: workKindSchema,
  reason: z.string(),
  fact_provider_id: z.string().optional(),
  command_skill_id: z.string().optional(),
  cashflow_bind: z.boolean().optional(),
  blocked_on: z.string().optional(),
  required_tags: z.array(z.string()).default([]),
  owner_agent: agentId.optional(),
});

export const humanCapabilityTagSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const humanCapabilityCatalogSchema = z.object({
  version: z.literal(1),
  tags: z.array(humanCapabilityTagSchema).default([]),
});

export const humanCapacityMemberSchema = z.object({
  employee_id: z.string().min(1),
  operator_id: z.string().optional(),
  tags: z.array(z.string()).default([]),
  weekly_hours_capacity: z.number().positive().optional(),
});

export const humanCapacityFileSchema = z.object({
  schema: z.literal("orgos.org.human-capacity.v1"),
  version: z.literal(1),
  members: z.array(humanCapacityMemberSchema).default([]),
});

export const towerPlanStatusSchema = z.enum([
  "needs_confirmation",
  "confirmed",
  "rejected",
  "executed",
]);

export const towerAssignmentSchema = z.object({
  work_kind: workKindSchema,
  assignee_employee_id: z.string().optional(),
  assignee_operator_id: z.string().optional(),
  due_date: dateString.optional(),
  blocked_on: z.string().optional(),
  to_agent: agentId.optional(),
  needs_ceo_pick: z.boolean().optional(),
  candidate_employee_ids: z.array(z.string()).optional(),
  judgment_only: z.boolean().optional(),
});

export const towerPlanSchema = z.object({
  plan_id: z.string(),
  message: z.string(),
  classification: towerClassificationSchema,
  assignment: towerAssignmentSchema,
  status: towerPlanStatusSchema,
  expires_at: z.string().optional(),
  work_order_ids: z.array(z.string()).optional(),
  reply_preview: z.string().optional(),
});

export type WorkKind = z.output<typeof workKindSchema>;
export type TowerClassification = z.output<typeof towerClassificationSchema>;
export type HumanCapabilityCatalog = z.output<typeof humanCapabilityCatalogSchema>;
export type HumanCapacityFile = z.output<typeof humanCapacityFileSchema>;
export type TowerPlan = z.output<typeof towerPlanSchema>;
export type TowerAssignment = z.output<typeof towerAssignmentSchema>;
