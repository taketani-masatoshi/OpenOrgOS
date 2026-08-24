import { z } from "zod";
import { dateString } from "../common.js";
import { fundingHandoffSchema } from "./funding-handoff.js";

export const policyFinanceInstrumentSchema = z.enum([
  "jfc_loan",
  "credit_guarantee_loan",
  "shoko_chukin_loan",
  "dbj_loan",
  "municipal_system_loan",
]);

export const policyFinanceStageSchema = z.enum([
  "research",
  "eligibility",
  "preparation",
  "application",
  "examination",
  "term_sheet",
  "closed",
  "declined",
  "monitoring",
]);

export const jfcBusinessLineSchema = z.enum([
  "national_life",
  "small_and_medium_enterprise",
  "agriculture_forestry_fisheries",
]);

export const policyFinanceCheckSchema = z.object({
  check_id: z.string().min(1),
  requirement: z.string().min(1),
  status: z.enum(["unknown", "pass", "concern", "fail"]).default("unknown"),
  evidence_ref: z.string().optional(),
  checked_at: dateString.optional(),
  notes: z.string().optional(),
});

export const policyFinanceDocumentSchema = z.object({
  document_id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(true),
  status: z
    .enum(["pending", "obtained", "not_applicable"])
    .default("pending"),
  official_form: z.boolean().default(false),
  source_url: z.string().url().optional(),
  fiscal_year: z.string().regex(/^FY\d{4}$/).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const policyFinanceCaseSchema = z
  .object({
    case_id: z.string().regex(/^CASE-PF-\d{3,}$/),
    funding_need_id: z.string().regex(/^FUND-\d{3,}$/).optional(),
    title: z.string().min(1),
    instrument: policyFinanceInstrumentSchema,
    stage: policyFinanceStageSchema.default("research"),
    program_name: z.string().min(1),
    program_id: z.string().optional(),
    fiscal_year: z.string().regex(/^FY\d{4}$/),
    authority_label: z.string().min(1),
    handling_financial_institution: z.string().optional(),
    jfc_business_line: jfcBusinessLineSchema.optional(),
    municipality_code: z.string().optional(),
    guarantee_association_label: z.string().optional(),
    target_amount_jpy: z.number().nonnegative(),
    amount_undecided: z.boolean().default(true),
    purpose: z.string().min(1),
    requested_term_months: z.number().int().positive().optional(),
    requested_grace_months: z.number().int().nonnegative().optional(),
    target_application_date: dateString.optional(),
    next_action_due: dateString.optional(),
    next_action: z.string().optional(),
    eligibility_status: z
      .enum(["unknown", "potentially_eligible", "ineligible", "verified"])
      .default("unknown"),
    eligibility_checks: z.array(policyFinanceCheckSchema).default([]),
    required_documents: z.array(policyFinanceDocumentSchema).default([]),
    collateral_policy: z
      .enum(["undecided", "unsecured_preferred", "available", "not_available"])
      .default("undecided"),
    personal_guarantee_policy: z
      .enum(["undecided", "avoid_preferred", "acceptable", "not_available"])
      .default("undecided"),
    guarantee_fee_estimate_jpy: z.number().nonnegative().optional(),
    evidence_refs: z.array(z.string().min(1)).default([]),
    pack_refs: z.array(z.string().min(1)).default([]),
    correspondence_draft_ids: z.array(z.string().min(1)).default([]),
    approval_ids: z.array(z.string().min(1)).default([]),
    company_event_ids: z.array(z.string().min(1)).default([]),
    handoffs: z.array(fundingHandoffSchema).default([]),
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.instrument === "jfc_loan" && !value.jfc_business_line) {
      ctx.addIssue({
        code: "custom",
        path: ["jfc_business_line"],
        message: "jfc_loan requires jfc_business_line",
      });
    }
    if (
      value.instrument === "municipal_system_loan" &&
      !value.municipality_code
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["municipality_code"],
        message: "municipal_system_loan requires municipality_code",
      });
    }
    if (
      ["application", "examination", "term_sheet", "closed", "monitoring"].includes(
        value.stage,
      ) &&
      (value.amount_undecided || value.eligibility_status !== "verified")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["stage"],
        message:
          "application or later requires a decided amount and verified eligibility",
      });
    }
  });

export const policyFinanceCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  cases: z.array(policyFinanceCaseSchema).default([]),
  notes: z.string().optional(),
});

export type PolicyFinanceInstrument = z.output<
  typeof policyFinanceInstrumentSchema
>;
export type PolicyFinanceStage = z.output<typeof policyFinanceStageSchema>;
export type JfcBusinessLine = z.output<typeof jfcBusinessLineSchema>;
export type PolicyFinanceCase = z.output<typeof policyFinanceCaseSchema>;
export type PolicyFinanceCasesFile = z.output<
  typeof policyFinanceCasesFileSchema
>;
