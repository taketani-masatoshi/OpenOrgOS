/**
 * Co-located Zod contract for the jp_women_empowerment declaration seeds.
 * Mirrors `steward/jurisdiction-packs/JP/modules/jp_women_empowerment/seed/*.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const womenEmpowermentStatusSchema = z.enum(["draft", "published", "retired"]);
export const womenEmpowermentReviewCycleSchema = z.enum([
  "annual",
  "biennial",
  "triennial",
  "ad_hoc",
]);
export const womenEmpowermentActionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "done",
  "cancelled",
]);

export const womenEmpowermentPlanPeriodSchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const womenEmpowermentTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  baseline: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const womenEmpowermentDeclarationSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  plan_type: z.string().min(1),
  status: womenEmpowermentStatusSchema,
  published_at: isoDate.nullable().optional(),
  plan_period: womenEmpowermentPlanPeriodSchema,
  declaration_types: z.array(z.string().min(1)).default([]),
  targets: z.array(womenEmpowermentTargetSchema).default([]),
  review_cycle: womenEmpowermentReviewCycleSchema,
  notes: z.string().nullable().optional(),
});

export const womenEmpowermentActionItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  owner_role: z.string().min(1),
  due: isoDate,
  status: womenEmpowermentActionStatusSchema,
  notes: z.string().nullable().optional(),
});

export const womenEmpowermentActionPlanSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  as_of: isoDate,
  items: z.array(womenEmpowermentActionItemSchema).default([]),
});

export type WomenEmpowermentStatus = z.output<typeof womenEmpowermentStatusSchema>;
export type WomenEmpowermentTarget = z.output<typeof womenEmpowermentTargetSchema>;
export type WomenEmpowermentDeclaration = z.output<typeof womenEmpowermentDeclarationSchema>;
export type WomenEmpowermentActionItem = z.output<typeof womenEmpowermentActionItemSchema>;
export type WomenEmpowermentActionPlan = z.output<typeof womenEmpowermentActionPlanSchema>;
