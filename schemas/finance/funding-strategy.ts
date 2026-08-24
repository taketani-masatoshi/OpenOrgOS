import { z } from "zod";
import { dateString } from "../common.js";
import { fundingHandoffSchema } from "./funding-handoff.js";

export const fundingInstrumentSchema = z.enum([
  "internal_cash",
  "working_capital_optimization",
  "subsidy_grant",
  "asset_sale",
  "lease",
  "factoring",
  "asset_based_finance",
  "bank_term_loan",
  "bank_revolver",
  "jfc_loan",
  "credit_guarantee_loan",
  "shoko_chukin_loan",
  "dbj_loan",
  "municipal_system_loan",
  "bond",
  "private_placement_bond",
  "shareholder_director_loan",
  "third_party_individual_loan",
  "intercompany_loan",
  "vc_equity",
  "strategic_equity",
  "preferred_equity",
  "mezzanine",
  "convertible_bond",
  "convertible_loan",
  "j_kiss",
]);

export const fundingNeedSchema = z
  .object({
    need_id: z.string().regex(/^FUND-\d{3,}$/),
    title: z.string().min(1),
    stage: z
      .enum(["research", "analysis", "decision", "execution", "closed"])
      .default("research"),
    purpose: z.enum([
      "working_capital",
      "capital_expenditure",
      "growth",
      "acquisition",
      "bridge",
      "refinancing",
      "restructuring",
      "other",
    ]),
    purpose_detail: z.string().min(1),
    target_amount_jpy: z.number().nonnegative(),
    amount_undecided: z.boolean().default(true),
    required_by: dateString.optional(),
    duration_months: z.number().int().positive().optional(),
    urgency: z.enum(["low", "medium", "high", "critical"]),
    cash_flow_profile: z.enum([
      "unknown",
      "pre_revenue",
      "loss_making",
      "volatile",
      "breakeven",
      "stable_positive",
    ]),
    repayment_capacity: z.enum(["unknown", "weak", "moderate", "strong"]),
    existing_debt_burden: z.enum([
      "unknown",
      "none",
      "low",
      "moderate",
      "high",
    ]),
    internal_cash_available: z.enum([
      "unknown",
      "none",
      "limited",
      "sufficient",
    ]),
    collateral_available: z.enum(["unknown", "none", "limited", "available"]),
    receivables_or_assets: z.enum([
      "unknown",
      "none",
      "receivables",
      "equipment",
      "real_estate",
      "mixed",
    ]),
    public_support_eligibility: z.enum([
      "unknown",
      "unlikely",
      "possible",
      "likely",
    ]),
    /**
     * Fit for JP policy / government-affiliated debt (JFC, credit guarantee,
     * Shoko Chukin, DBJ, municipal system loans). Separate from subsidy grants.
     */
    policy_finance_fit: z
      .enum(["unknown", "unlikely", "possible", "likely"])
      .default("unknown"),
    dilution_tolerance: z.enum(["undecided", "none", "limited", "acceptable"]),
    control_rights_tolerance: z.enum([
      "undecided",
      "none",
      "limited",
      "acceptable",
    ]),
    guarantee_tolerance: z.enum(["undecided", "none", "limited", "acceptable"]),
    strategic_investor_value: z.enum(["unknown", "low", "medium", "high"]),
    related_party_funding_available: z.enum([
      "unknown",
      "no",
      "possible",
      "yes",
    ]),
    private_lender_available: z.enum(["unknown", "no", "possible", "yes"]),
    next_equity_round_expected: z.enum(["unknown", "no", "possible", "yes"]),
    refinancing_risk_tolerance: z.enum(["undecided", "low", "medium", "high"]),
    documentation_readiness: z.enum(["unknown", "low", "medium", "high"]),
    constraints: z.array(z.string().min(1)).default([]),
    evidence_refs: z.array(z.string().min(1)).default([]),
    candidate_instruments: z.array(fundingInstrumentSchema).default([]),
    selected_instrument: fundingInstrumentSchema.optional(),
    linked_bank_case_id: z
      .string()
      .regex(/^CASE-BF-\d{3,}$/)
      .optional(),
    linked_capital_raise_case_ids: z
      .array(z.string().regex(/^CASE-FR-\d{3,}$/))
      .default([]),
    linked_policy_finance_case_ids: z
      .array(z.string().regex(/^CASE-PF-\d{3,}$/))
      .default([]),
    decision_requested_at: dateString.optional(),
    human_decision_status: z
      .enum(["not_requested", "pending", "approved", "rejected"])
      .default("not_requested"),
    approval_id: z.string().optional(),
    handoffs: z.array(fundingHandoffSchema).default([]),
    notes: z.string().optional(),
  })
  .superRefine((need, ctx) => {
    if (need.selected_instrument && need.human_decision_status !== "approved") {
      ctx.addIssue({
        code: "custom",
        path: ["selected_instrument"],
        message: "selected_instrument requires human_decision_status=approved",
      });
    }
    if (
      need.human_decision_status === "approved" &&
      (!need.selected_instrument || !need.approval_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["approval_id"],
        message:
          "approved funding strategy requires selected_instrument and approval_id",
      });
    }
  });

export const fundingStrategyFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  needs: z.array(fundingNeedSchema).default([]),
  notes: z.string().optional(),
});

export type FundingInstrument = z.output<typeof fundingInstrumentSchema>;
export type FundingNeed = z.output<typeof fundingNeedSchema>;
export type FundingStrategyFile = z.output<typeof fundingStrategyFileSchema>;
