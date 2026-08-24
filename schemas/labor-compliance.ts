import { z } from "zod";
import { dateString } from "./common.js";

export const laborDocumentKind = z.enum([
  "work_rules",
  "work_rules_filing",
  "employee_opinion",
  "remote_work_rules",
  "flex_agreement",
  "overtime_agreement",
  "wage_deduction_agreement",
  "bank_transfer_consent",
  "labor_conditions_notice",
  "employee_representative_election",
]);

export const laborDocumentStatus = z.enum([
  "draft",
  "ready_for_signature",
  "signed",
  "filed",
  "effective",
  "expired",
  "superseded",
  "not_required",
]);

export const laborRoleCategory = z.enum([
  "part_time_employee",
  "regular_employee",
  "employee_executive_officer",
  "employee_concurrent_director",
  "nonemployee_executive_officer",
  "nonemployee_director",
  "representative_director",
  "contractor",
]);

export const laborApplicability = z.enum([
  "required_now",
  "conditional",
  "not_applicable",
]);

export const laborDocumentEntrySchema = z
  .object({
    id: z.string().regex(/^LAB-\d{3,}$/),
    title: z.string().min(1),
    kind: laborDocumentKind,
    status: laborDocumentStatus,
    required: z.boolean().default(true),
    required_when: z.string().min(1),
    legal_basis: z.string().min(1),
    applicability: laborApplicability.default("conditional"),
    applies_to: z.array(laborRoleCategory).min(1),
    authority: z.string().optional(),
    template_ref: z.string().min(1),
    official_form_url: z.string().url().optional(),
    signed_on: dateString.optional(),
    filed_on: dateString.optional(),
    effective_from: dateString.optional(),
    expires_on: dateString.optional(),
    evidence_ref: z.string().min(1).optional(),
    reminder_days: z.array(z.number().int().nonnegative()).default([90, 30, 7]),
    notes: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    if (["signed", "effective"].includes(entry.status) && !entry.signed_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signed_on"],
        message: `${entry.status} requires signed_on`,
      });
    }
    if (entry.status === "filed" && (!entry.filed_on || !entry.evidence_ref)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filed_on"],
        message: "filed requires filed_on and evidence_ref",
      });
    }
    if (entry.expires_on && entry.effective_from && entry.expires_on < entry.effective_from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_on"],
        message: "expires_on cannot be before effective_from",
      });
    }
  });

export const laborDocumentsFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  workplace_id: z.string().min(1),
  employee_count: z.number().int().nonnegative(),
  current_composition: z.array(laborRoleCategory).min(1),
  documents: z.array(laborDocumentEntrySchema).default([]),
  notes: z.string().optional(),
});

export type LaborDocumentEntry = z.output<typeof laborDocumentEntrySchema>;
export type LaborDocumentsFile = z.output<typeof laborDocumentsFileSchema>;
