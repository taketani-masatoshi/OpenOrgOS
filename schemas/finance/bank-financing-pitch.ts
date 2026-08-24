import { z } from "zod";
import { dateString } from "../common.js";

/**
 * Bank financing business-case narrative (L1 only).
 * Experience summaries must not include private addresses, phone numbers,
 * account numbers, or other L2 values.
 */
export const bankFinancingAssumptionSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "market",
    "operations",
    "pricing",
    "cost",
    "timing",
    "funding",
    "other",
  ]),
  statement: z.string().min(1),
  basis: z.string().min(1),
  sensitivity: z.string().optional(),
});

export const bankFinancingRiskSchema = z.object({
  id: z.string().min(1),
  risk: z.string().min(1),
  likelihood: z.enum(["low", "medium", "high"]).default("medium"),
  impact: z.enum(["low", "medium", "high"]).default("medium"),
  mitigation: z.string().min(1),
});

export const bankFinancingTeamMemberSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  employee_id: z.string().optional(),
  responsibilities: z.string().min(1),
  /** L1 only: public/professional experience relevant to execution. */
  experience_summary: z.string().min(1),
  years_relevant: z.number().nonnegative().optional(),
});

export const bankFinancingMilestoneSchema = z.object({
  date: dateString,
  title: z.string().min(1),
  status: z.enum(["done", "in_progress", "planned"]).default("planned"),
  notes: z.string().optional(),
});

export const bankFinancingUseOfFundsLineSchema = z.object({
  category: z.string().min(1),
  amount_jpy: z.number().nonnegative(),
  share_pct: z.number().min(0).max(100).optional(),
  description: z.string().min(1),
  expected_effect: z.string().optional(),
});

export const bankFinancingExternalDocumentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["pending", "obtained", "not_applicable"]).default("pending"),
  storage_hint: z.string().optional(),
  obtained_at: dateString.optional(),
  notes: z.string().optional(),
});

export const bankFinancingCreditEvidenceSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "market_demand",
    "traction",
    "repayment",
    "use_of_funds",
    "collateral",
    "guarantee",
    "team_continuity",
    "other",
  ]),
  label: z.string().min(1),
  status: z.enum(["pending", "available", "not_applicable"]).default("pending"),
  /** L1-safe repo-relative reference or external-document id. */
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const bankFinancingPitchCaseSchema = z.object({
  case_id: z.string().regex(/^CASE-BF-\d{3,}$/),
  project_title: z.string().min(1),
  project_summary: z.string().min(1),
  why_now: z.string().min(1),
  use_of_funds: z.string().min(1),
  use_of_funds_breakdown: z
    .array(bankFinancingUseOfFundsLineSchema)
    .default([]),
  repayment_source: z.string().min(1),
  profitability_thesis: z.string().min(1),
  probability_notes: z.string().min(1),
  market_context: z.string().min(1),
  assumptions: z.array(bankFinancingAssumptionSchema).min(1),
  risks: z.array(bankFinancingRiskSchema).min(1),
  team: z.array(bankFinancingTeamMemberSchema).min(1),
  milestones: z.array(bankFinancingMilestoneSchema).default([]),
  collateral_or_support_notes: z.string().optional(),
  /** @deprecated Prefer external_documents. Kept for back-compat. */
  documents_to_attach_externally: z.array(z.string().min(1)).default([]),
  external_documents: z.array(bankFinancingExternalDocumentSchema).default([]),
  /** Structured lender-side evidence inventory used by deterministic review. */
  credit_evidence: z.array(bankFinancingCreditEvidenceSchema).default([]),
  reviewed_by: z.string().optional(),
  reviewed_at: dateString.optional(),
});

export const bankFinancingPitchFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  company_overview_override: z.string().optional(),
  cases: z.array(bankFinancingPitchCaseSchema).default([]),
  notes: z.string().optional(),
});

export type BankFinancingAssumption = z.output<
  typeof bankFinancingAssumptionSchema
>;
export type BankFinancingRisk = z.output<typeof bankFinancingRiskSchema>;
export type BankFinancingTeamMember = z.output<
  typeof bankFinancingTeamMemberSchema
>;
export type BankFinancingUseOfFundsLine = z.output<
  typeof bankFinancingUseOfFundsLineSchema
>;
export type BankFinancingExternalDocument = z.output<
  typeof bankFinancingExternalDocumentSchema
>;
export type BankFinancingCreditEvidence = z.output<
  typeof bankFinancingCreditEvidenceSchema
>;
export type BankFinancingPitchCase = z.output<
  typeof bankFinancingPitchCaseSchema
>;
export type BankFinancingPitchFile = z.output<
  typeof bankFinancingPitchFileSchema
>;
