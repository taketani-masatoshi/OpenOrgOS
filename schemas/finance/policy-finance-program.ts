import { z } from "zod";
import { dateString } from "../common.js";
import {
  jfcBusinessLineSchema,
  policyFinanceDocumentSchema,
  policyFinanceInstrumentSchema,
} from "./policy-finance-case.js";

export const policyFinanceProgramRequirementSchema = z.object({
  requirement_id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  blocking: z.boolean().default(true),
  official_confirmation_required: z.boolean().default(true),
});

/** Official application form link for a catalog fiscal year (not a filled case attachment). */
export const policyFinanceOfficialFormSchema = z.object({
  form_id: z.string().min(1),
  label: z.string().min(1),
  form_url: z.string().url(),
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  last_verified_at: dateString.optional(),
});

export const policyFinanceProgramSchema = z
  .object({
    program_id: z.string().regex(/^PF-PROGRAM-[A-Z0-9-]+$/),
    instrument: policyFinanceInstrumentSchema,
    program_name: z.string().min(1),
    authority_label: z.string().min(1),
    fiscal_year: z.string().regex(/^FY\d{4}$/),
    status: z
      .enum(["active", "requires_official_confirmation", "closed"])
      .default("requires_official_confirmation"),
    /** candidate = 選定前プレースホルダ, named_program = 公式制度ページへ昇格済み */
    catalog_tier: z.enum(["candidate", "named_program"]).default("candidate"),
    /** Parent candidate program_id when this row was promoted to a named program. */
    promoted_from: z
      .string()
      .regex(/^PF-PROGRAM-[A-Z0-9-]+$/)
      .optional(),
    jfc_business_line: jfcBusinessLineSchema.optional(),
    municipality_code: z.string().optional(),
    application_window: z
      .object({
        opens_on: dateString,
        closes_on: dateString,
      })
      .optional(),
    requirements: z.array(policyFinanceProgramRequirementSchema).default([]),
    required_documents: z.array(policyFinanceDocumentSchema).default([]),
    official_forms: z.array(policyFinanceOfficialFormSchema).default([]),
    source_url: z.string().url(),
    source_checked_at: dateString,
    /** Soft deadline to re-verify official pages before relying on this row. */
    next_review_by: dateString.optional(),
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.application_window &&
      value.application_window.opens_on > value.application_window.closes_on
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["application_window"],
        message: "application window opens_on must be on or before closes_on",
      });
    }
    if (value.instrument === "jfc_loan" && !value.jfc_business_line) {
      ctx.addIssue({
        code: "custom",
        path: ["jfc_business_line"],
        message: "jfc_loan program requires jfc_business_line",
      });
    }
    if (
      value.instrument === "municipal_system_loan" &&
      !value.municipality_code
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["municipality_code"],
        message: "municipal_system_loan program requires municipality_code",
      });
    }
    for (const [index, form] of value.official_forms.entries()) {
      if (form.fiscal_year !== value.fiscal_year) {
        ctx.addIssue({
          code: "custom",
          path: ["official_forms", index, "fiscal_year"],
          message: "official form fiscal_year must match program fiscal_year",
        });
      }
    }
  });

export const policyFinanceProgramsFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString,
  /** Catalog-wide reminder to roll FY rows and re-check official forms. */
  next_catalog_review_by: dateString.optional(),
  update_procedure_ref: z.string().optional(),
  programs: z.array(policyFinanceProgramSchema).default([]),
  notes: z.string().optional(),
});

export type PolicyFinanceProgram = z.output<typeof policyFinanceProgramSchema>;
export type PolicyFinanceProgramsFile = z.output<
  typeof policyFinanceProgramsFileSchema
>;
