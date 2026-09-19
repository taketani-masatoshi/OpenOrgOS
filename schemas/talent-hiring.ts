import { z } from "zod";

export const projectBudgetSchema = z.object({
  max_hourly_rate: z.number().nonnegative(),
  currency: z.string().min(1),
});

export const projectRequirementSchema = z.object({
  summary: z.string().min(1),
  domain: z.string().min(1).optional(),
  budget: projectBudgetSchema.optional(),
  duration_days: z.number().int().positive().optional(),
  must_have_skills: z.array(z.string().min(1)).optional(),
});

export const structuredRfpSchema = z.object({
  title: z.string().min(1),
  scope: z.string().min(1),
  selection_criteria: z.array(z.string().min(1)),
  budget: projectBudgetSchema,
  must_have_skills: z.array(z.string().min(1)),
  min_years: z.number().nonnegative(),
});

export const talentCandidateSchema = z.object({
  candidate_id: z.string().min(1),
  display_name: z.string().min(1),
  skills: z.array(z.string().min(1)),
  years: z.number().nonnegative(),
  hourly_rate: z.number().nonnegative(),
});

export const scoredCandidateSchema = talentCandidateSchema.extend({
  score: z.number().nonnegative(),
});

export const contractTermsSchema = z.object({
  engagement: z.string().min(1),
  hours: z.number().nonnegative(),
  currency: z.string().min(1),
  max_total: z.number().nonnegative(),
});

export const passKeyApprovalPayloadSchema = z.object({
  rfp_title: z.string().min(1),
  candidate_ids: z.array(z.string().min(1)),
  terms: contractTermsSchema,
});

export const passKeyApprovalRequestSchema = z.object({
  request_id: z.string().min(1),
  ceremony_kind: z.literal("settlement"),
  created_at: z.string().min(1),
  payload: passKeyApprovalPayloadSchema,
  payload_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type ProjectBudget = z.output<typeof projectBudgetSchema>;
export type ProjectRequirement = z.output<typeof projectRequirementSchema>;
export type StructuredRFP = z.output<typeof structuredRfpSchema>;
export type TalentCandidate = z.output<typeof talentCandidateSchema>;
export type ScoredCandidate = z.output<typeof scoredCandidateSchema>;
export type ContractTerms = z.output<typeof contractTermsSchema>;
export type PassKeyApprovalPayload = z.output<typeof passKeyApprovalPayloadSchema>;
export type PassKeyApprovalRequest = z.output<typeof passKeyApprovalRequestSchema>;

export interface RfpEnrichment {
  title?: string;
  scope?: string;
  selection_criteria?: string[];
  budget?: ProjectBudget;
  must_have_skills?: string[];
  min_years?: number;
}

export interface RfpEnricher {
  enrich(requirement: ProjectRequirement): RfpEnrichment;
}

export interface GenerateRfpDeps {
  enricher?: RfpEnricher;
}

export interface BuildPassKeyPayloadInput {
  rfp: StructuredRFP;
  shortlist: ScoredCandidate[];
  terms: ContractTerms;
  clock?: () => string;
  id?: string;
}
