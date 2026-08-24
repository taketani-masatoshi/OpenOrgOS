import { z } from "zod";
import { dateString, riskLevel } from "./common.js";
import { contractProtocolConfigSchema } from "./protocol/contract-protocol.js";

export const contractType = z.enum([
  "rental",
  "lease",
  "purchase",
  "director",
  "management",
  "cleaning",
  "ota",
  "insurance",
  "construction",
  "loan",
  "employment",
  "outsourcing",
  "advisory",
  "system",
  "nda",
  "partnership",
]);

export const contractRiskSchema = z.object({
  renewal_deadline: dateString.optional(),
  termination_deadline: dateString.optional(),
  risk_level: riskLevel.optional(),
  notes: z.string().optional(),
});

export const contractStatus = z.enum([
  "draft",
  "pending_signature",
  "executed",
  "terminated",
]);

export const counterpartyType = z.enum(["individual", "company"]);

export const contractDocumentsSchema = z.object({
  draft: z.string().optional(),
  executed: z.string().optional(),
  enrollment: z.string().optional(),
});

export const contractCompensationSchema = z.object({
  type: z.enum(["monthly", "hourly", "fixed", "milestone"]).optional(),
  amount: z.number().nonnegative().optional(),
  tax_included: z.boolean().optional(),
  payment_terms: z.string().optional(),
  invoice_registration: z.string().optional(),
});

/** Lifecycle transition stages recorded on the contract YAML (audit link). */
export const contractLifecycleStageSchema = z.enum([
  "pending_signature",
  "executed",
  "terminated",
]);

export const contractLifecycleEventSchema = z.object({
  stage: contractLifecycleStageSchema,
  revision: z.number().int().nonnegative(),
  event_id: z.string().min(1),
  recorded_at: z.string().min(1),
  actor: z.string().min(1).optional(),
});

/** CEO / Canvas L1 — impact of an obligation or whole contract */
export const contractImpactLevelSchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

/** Short duty line for Canvas (no L2). party: us = 当社 */
export const contractDutyLineSchema = z.object({
  party: z.enum(["us", "them", "both"]).default("us"),
  summary: z.string().min(1).max(200),
  impact: contractImpactLevelSchema.optional(),
});

export const contractRightLineSchema = z.object({
  party: z.enum(["us", "them", "both"]).default("us"),
  summary: z.string().min(1).max(200),
});

export const contractExitWindowKindSchema = z.enum([
  "renewal_notice",
  "mid_term_termination",
  "non_renewal",
  "end_of_term",
]);

export const contractExitWindowSchema = z.object({
  kind: contractExitWindowKindSchema,
  /** Decision / notice deadline (YYYY-MM-DD) */
  deadline: dateString.optional(),
  summary: z.string().min(1).max(200),
  consequence_if_missed: z.string().max(200).optional(),
});

/**
 * CEO-facing L1 projection fields. Optional — heuristics fill gaps for Canvas.
 * Do not put bank numbers, addresses, or contract body here.
 */
export const contractCeoSchema = z.object({
  business_impact: contractImpactLevelSchema.optional(),
  impact_note: z.string().max(240).optional(),
  our_obligations: z.array(contractDutyLineSchema).max(8).optional(),
  our_rights: z.array(contractRightLineSchema).max(8).optional(),
  exit_windows: z.array(contractExitWindowSchema).max(6).optional(),
  /** When true, excluded from CEO Canvas / Web portfolio (法務デモ等) */
  demo: z.boolean().optional(),
});

export const contractSchema = z.object({
  id: z.string().regex(/^CTR-\d{3,}$/),
  name: z.string().min(1),
  counterparty: z.string().min(1),
  counterparty_type: counterpartyType.optional(),
  counterparty_stakeholder_id: z.string().optional(),
  counterparty_address: z.string().optional(),
  type: contractType,
  status: contractStatus.default("draft"),
  start_date: dateString,
  end_date: dateString.optional(),
  auto_renewal: z.boolean().default(false),
  owner: z.string().optional(),
  property_id: z.string().optional(),
  monthly_cost: z.number().nonnegative().optional(),
  compensation: contractCompensationSchema.optional(),
  scope_summary: z.string().optional(),
  documents: contractDocumentsSchema.optional(),
  executed_date: dateString.optional(),
  conflict_approval_date: dateString.optional(),
  risk: contractRiskSchema.optional(),
  notes: z.string().optional(),
  protocol: contractProtocolConfigSchema.optional(),
  /** CEO Canvas L1: duties, rights, exit windows, impact */
  ceo: contractCeoSchema.optional(),
  /** Appended by `orgos contracts transition` — do not invent historically */
  lifecycle_events: z.array(contractLifecycleEventSchema).optional(),
});

export type Contract = z.output<typeof contractSchema>;
export type ContractStatus = z.output<typeof contractStatus>;
export type ContractType = z.output<typeof contractType>;
export type ContractLifecycleStage = z.output<typeof contractLifecycleStageSchema>;
export type ContractLifecycleEvent = z.output<typeof contractLifecycleEventSchema>;
export type ContractImpactLevel = z.output<typeof contractImpactLevelSchema>;
export type ContractCeo = z.output<typeof contractCeoSchema>;
export type ContractExitWindow = z.output<typeof contractExitWindowSchema>;
