import { z } from "zod";
import { dateString } from "../common.js";
import { fundingHandoffSchema } from "./funding-handoff.js";

export const capitalRaiseStageSchema = z.enum([
  "research",
  "preparation",
  "outreach",
  "diligence",
  "term_sheet",
  "closing",
  "closed",
  "declined",
]);

export const capitalRaiseLegalReviewStatusSchema = z.enum([
  "not_started",
  "in_review",
  "complete",
]);

export const capitalRaiseUseOfFundsLineSchema = z.object({
  category: z.string().min(1),
  amount_jpy: z.number().nonnegative(),
  timing: z.string().min(1),
  description: z.string().min(1),
  expected_effect: z.string().min(1),
  evidence_ref: z.string().optional(),
});

export const capitalRaiseEvidenceSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "market",
    "traction",
    "financial",
    "team",
    "technology",
    "legal",
    "customer",
    "other",
  ]),
  label: z.string().min(1),
  status: z.enum(["pending", "available", "not_applicable"]).default("pending"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const capitalRaiseExternalDocumentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["pending", "obtained", "not_applicable"]).default("pending"),
  storage_hint: z.string().optional(),
  notes: z.string().optional(),
});

export const capitalRaiseCapTableLineSchema = z.object({
  /** stakeholder_id or a non-personal aggregate label. */
  holder_ref: z.string().min(1),
  security_type: z.enum([
    "common",
    "preferred",
    "stock_option",
    "warrant",
    "convertible",
    "other",
  ]),
  fully_diluted_pct: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const capitalRaiseDataRoomItemSchema = z.object({
  item_id: z.string().min(1),
  category: z.enum([
    "corporate",
    "financial",
    "commercial",
    "technology",
    "people",
    "legal",
    "tax",
    "other",
  ]),
  label: z.string().min(1),
  status: z.enum(["pending", "available", "not_applicable"]).default("pending"),
  reference: z.string().optional(),
  access_level: z.enum(["internal", "nda_required", "approved_external"]),
  approved_for_external_at: dateString.optional(),
  notes: z.string().optional(),
});

export const capitalRaiseQuestionSchema = z.object({
  question_id: z.string().regex(/^FRQ-\d{8}-\d{3}$/),
  asked_at: dateString,
  counterparty_label: z.string().min(1),
  question: z.string().min(1),
  status: z.enum(["open", "drafted", "answered", "closed"]).default("open"),
  draft_answer: z.string().optional(),
  adopted_answer: z.string().optional(),
  evidence_refs: z.array(z.string().min(1)).default([]),
  correspondence_draft_id: z.string().optional(),
  approval_id: z.string().optional(),
});

export const capitalRaiseTermSheetSchema = z.object({
  term_sheet_id: z.string().regex(/^TS-\d{3,}$/),
  counterparty_label: z.string().min(1),
  received_at: dateString.optional(),
  status: z
    .enum(["draft", "received", "under_review", "selected", "rejected"])
    .default("draft"),
  amount_jpy: z.number().nonnegative(),
  valuation_or_principal: z.string().min(1),
  economics_summary: z.string().min(1),
  governance_summary: z.string().min(1),
  liquidation_or_repayment_summary: z.string().min(1),
  exclusivity_until: dateString.optional(),
  conditions_precedent: z.array(z.string().min(1)).default([]),
  legal_issues: z.array(z.string().min(1)).default([]),
  reference: z.string().optional(),
  selection_approval_id: z.string().optional(),
});

export const capitalRaiseClosingEvidenceSchema = z.object({
  evidence_id: z.string().min(1),
  category: z.enum([
    "board_approval",
    "shareholder_approval",
    "executed_agreement",
    "payment",
    "issuance",
    "registration",
    "tax",
    "other",
  ]),
  label: z.string().min(1),
  status: z.enum(["pending", "verified", "not_applicable"]).default("pending"),
  reference: z.string().optional(),
  verified_at: dateString.optional(),
  verified_by: z.string().optional(),
  notes: z.string().optional(),
});

const commonCaseFields = {
  case_id: z.string().regex(/^CASE-FR-\d{3,}$/),
  title: z.string().min(1),
  stage: capitalRaiseStageSchema.default("research"),
  investor_label: z.string().min(1),
  contact_ref: z.string().optional(),
  target_amount_jpy: z.number().nonnegative(),
  amount_undecided: z.boolean().default(true),
  purpose: z.string().min(1),
  target_close_date: dateString.optional(),
  next_action_due: dateString.optional(),
  next_action: z.string().optional(),
  investment_thesis: z.string().min(1),
  market_context: z.string().min(1),
  traction_summary: z.string().min(1),
  business_model: z.string().min(1),
  financial_plan_ref: z.string().min(1),
  use_of_funds: z.array(capitalRaiseUseOfFundsLineSchema).default([]),
  milestones: z.array(z.string().min(1)).default([]),
  risks: z
    .array(
      z.object({
        risk: z.string().min(1),
        mitigation: z.string().min(1),
      }),
    )
    .default([]),
  cap_table: z.array(capitalRaiseCapTableLineSchema).default([]),
  evidence: z.array(capitalRaiseEvidenceSchema).default([]),
  external_documents: z.array(capitalRaiseExternalDocumentSchema).default([]),
  data_room: z.array(capitalRaiseDataRoomItemSchema).default([]),
  question_log: z.array(capitalRaiseQuestionSchema).default([]),
  term_sheets: z.array(capitalRaiseTermSheetSchema).default([]),
  selected_term_sheet_id: z.string().optional(),
  closing_evidence: z.array(capitalRaiseClosingEvidenceSchema).default([]),
  legal_review_status:
    capitalRaiseLegalReviewStatusSchema.default("not_started"),
  board_approval_id: z
    .string()
    .regex(/^APR-\d{8}-\d{3,}$/)
    .optional(),
  shareholder_approval_id: z
    .string()
    .regex(/^APR-\d{8}-\d{3,}$/)
    .optional(),
  pack_refs: z.array(z.string().min(1)).default([]),
  correspondence_draft_ids: z.array(z.string().min(1)).default([]),
  approval_ids: z.array(z.string().min(1)).default([]),
  company_event_ids: z.array(z.string().min(1)).default([]),
  handoffs: z.array(fundingHandoffSchema).default([]),
  notes: z.string().optional(),
};

export const vcEquityTermsSchema = z.object({
  pre_money_valuation_jpy: z.number().positive().optional(),
  share_class: z.string().optional(),
  option_pool_pre_money_pct: z.number().min(0).max(100).optional(),
  target_investor_ownership_pct: z.number().min(0).max(100).optional(),
  liquidation_preference: z.string().optional(),
  anti_dilution: z.string().optional(),
  governance_rights: z.array(z.string().min(1)).default([]),
});

export const mezzanineTermsSchema = z.object({
  cash_interest_pct: z.number().min(0).optional(),
  pik_interest_pct: z.number().min(0).optional(),
  maturity_months: z.number().int().positive().optional(),
  amortization: z.string().optional(),
  security: z.string().optional(),
  subordination: z.string().optional(),
  equity_kicker_pct: z.number().min(0).max(100).optional(),
  annual_cash_available_for_debt_service_jpy: z.number().optional(),
  annual_debt_service_jpy: z.number().positive().optional(),
});

export const jKissTermsSchema = z.object({
  discount_rate_pct: z.number().min(0).max(100).optional(),
  valuation_cap_jpy: z.number().positive().optional(),
  qualified_financing_threshold_jpy: z.number().positive().optional(),
  conversion_trigger_summary: z.string().optional(),
  long_stop_date: dateString.optional(),
  pro_rata_rights: z.boolean().optional(),
  most_favored_nation: z.boolean().optional(),
});

export const capitalRaiseCaseSchema = z.discriminatedUnion("instrument", [
  z.object({
    ...commonCaseFields,
    instrument: z.literal("vc_equity"),
    terms: vcEquityTermsSchema.default({}),
  }),
  z.object({
    ...commonCaseFields,
    instrument: z.literal("mezzanine"),
    terms: mezzanineTermsSchema.default({}),
  }),
  z.object({
    ...commonCaseFields,
    instrument: z.literal("j_kiss"),
    terms: jKissTermsSchema.default({}),
  }),
]);

export const capitalRaiseCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  cases: z.array(capitalRaiseCaseSchema).default([]),
  notes: z.string().optional(),
});

export type CapitalRaiseCase = z.output<typeof capitalRaiseCaseSchema>;
export type CapitalRaiseCasesFile = z.output<
  typeof capitalRaiseCasesFileSchema
>;
export type CapitalRaiseStage = z.output<typeof capitalRaiseStageSchema>;
export type CapitalRaiseDataRoomItem = z.output<
  typeof capitalRaiseDataRoomItemSchema
>;
export type CapitalRaiseTermSheet = z.output<
  typeof capitalRaiseTermSheetSchema
>;
export type CapitalRaiseClosingEvidence = z.output<
  typeof capitalRaiseClosingEvidenceSchema
>;
