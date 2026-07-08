import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const subsidyRequirementRule = z.enum([
  "max_employees",
  "min_employees",
  "max_capital_yen",
  "requires_corporate_number",
  "requires_jurisdiction_jp",
  "manual",
]);

export const subsidyRequirementSchema = z.object({
  id: z.string(),
  label: z.string(),
  rule: subsidyRequirementRule,
  max_value: z.number().optional(),
  min_value: z.number().optional(),
  notes: z.string().optional(),
});

export const subsidyProgramsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  programs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source_url: z.string().url().optional(),
      brief_path: z.string().optional(),
      managing_body: z.string().optional(),
      application_deadline: isoDate.optional(),
      status: z.enum(["tracking", "eligibility_check", "drafting", "submitted", "closed"]).optional(),
      requirements: z.array(subsidyRequirementSchema).default([]),
      notes: z.string().optional(),
    })
  ),
});

export const subsidyPersonnelCostBasisFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  standard_hours_per_month: z.number().positive().default(160),
  overhead_rate_pct: z.number().min(0).max(100).default(15),
  entries: z.array(
    z.object({
      employee_id: z.string(),
      role_label: z.string(),
      monthly_salary_yen: z.number().nonnegative(),
      subsidy_eligible: z.boolean().default(true),
      allocation_pct: z.number().min(0).max(100).default(100),
      notes: z.string().optional(),
    })
  ),
});

export const subsidyFieldMapFileSchema = z.object({
  mappings: z.array(
    z.object({
      form_field: z.string(),
      source: z.string(),
      format: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const subsidyApplicationRegistryFileSchema = z.object({
  applications: z.array(
    z.object({
      id: z.string(),
      program_id: z.string(),
      status: z.enum(["draft", "review", "submitted", "withdrawn"]).default("draft"),
      docs_root: z.string().optional(),
      updated_on: isoDate.optional(),
      notes: z.string().optional(),
    })
  ),
});

export const subsidyBriefFileSchema = z.object({
  program_id: z.string(),
  source_url: z.string().url().optional(),
  extracted_on: isoDate.optional(),
  title: z.string().optional(),
  requirements: z.array(subsidyRequirementSchema).default([]),
  bibliographic_fields: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        required: z.boolean().optional(),
      })
    )
    .optional(),
  notes: z.string().optional(),
});

export type SubsidyRequirement = z.output<typeof subsidyRequirementSchema>;
export type SubsidyProgramsFile = z.output<typeof subsidyProgramsFileSchema>;
export type SubsidyPersonnelCostBasisFile = z.output<typeof subsidyPersonnelCostBasisFileSchema>;
