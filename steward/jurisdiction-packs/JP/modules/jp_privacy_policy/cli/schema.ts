/**
 * Co-located Zod contract for the jp_privacy_policy seeds.
 * Mirrors `steward/jurisdiction-packs/JP/modules/jp_privacy_policy/seed/policy-meta.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Public policy versions are semantic — a section change is a minor bump. */
const semanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/);

export const privacyPolicyStatusSchema = z.enum(["draft", "published", "retired"]);
export const privacyPolicyReviewCycleSchema = z.enum([
  "annual",
  "biennial",
  "triennial",
  "ad_hoc",
]);

export const privacyPolicyMetaSchema = z.object({
  schema_version: z.number().int().positive(),
  module_id: z.string().min(1),
  status: privacyPolicyStatusSchema,
  version: semanticVersion,
  published_at: isoDate.nullable().optional(),
  published_url: z.string().min(1).nullable().optional(),
  contact_email: z.string().email(),
  dpo_role: z.string().min(1),
  regulation_ref: z.string().min(1).nullable().optional(),
  review_cycle: privacyPolicyReviewCycleSchema,
  next_review: isoDate.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type PrivacyPolicyStatus = z.output<typeof privacyPolicyStatusSchema>;
export type PrivacyPolicyMeta = z.output<typeof privacyPolicyMetaSchema>;
