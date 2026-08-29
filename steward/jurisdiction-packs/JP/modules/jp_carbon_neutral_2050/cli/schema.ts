/**
 * Co-located Zod contract for the jp_carbon_neutral_2050 declaration seeds.
 * Mirrors `steward/jurisdiction-packs/JP/modules/jp_carbon_neutral_2050/seed/*.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const calendarYear = z.number().int().min(1900).max(2200);

/** Declaration lifecycle — the text is externally committed from `signed` on. */
export const carbonNeutralStatusSchema = z.enum(["draft", "signed", "published", "retired"]);
export const carbonNeutralReviewCycleSchema = z.enum(["annual", "biennial", "triennial", "ad_hoc"]);
export const carbonNeutralActionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "done",
  "cancelled",
]);

export const carbonNeutralInterimTargetSchema = z.object({
  year: calendarYear,
  scope: z.string().min(1),
  reduction_pct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const carbonNeutralDeclarationSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  status: carbonNeutralStatusSchema,
  signed_at: isoDate.nullable().optional(),
  published_url: z.string().min(1).nullable().optional(),
  review_cycle: carbonNeutralReviewCycleSchema,
  next_review: isoDate.nullable().optional(),
  baseline_year: calendarYear,
  net_zero_year: calendarYear,
  interim_targets: z.array(carbonNeutralInterimTargetSchema).default([]),
  scopes_in_scope: z.array(z.string().min(1)).default([]),
  scope3_notes: z.string().nullable().optional(),
  signatory_role: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const carbonNeutralActionItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  owner_role: z.string().min(1),
  due: isoDate,
  status: carbonNeutralActionStatusSchema,
  expected_reduction_tco2e: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const carbonNeutralActionPlanSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  as_of: isoDate,
  items: z.array(carbonNeutralActionItemSchema).default([]),
});

export type CarbonNeutralStatus = z.output<typeof carbonNeutralStatusSchema>;
export type CarbonNeutralInterimTarget = z.output<typeof carbonNeutralInterimTargetSchema>;
export type CarbonNeutralDeclaration = z.output<typeof carbonNeutralDeclarationSchema>;
export type CarbonNeutralActionItem = z.output<typeof carbonNeutralActionItemSchema>;
export type CarbonNeutralActionPlan = z.output<typeof carbonNeutralActionPlanSchema>;
