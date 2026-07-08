import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const corporateRegistrationProcedureCategory = z.enum([
  "establishment",
  "change",
  "corporate_reorg",
  "termination",
]);

export const corporateRegistrationCaseStatus = z.enum([
  "draft",
  "review",
  "filed",
  "registered",
  "withdrawn",
]);

const personBlockSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  role: z.string().optional(),
  shares: z.number().int().positive().optional(),
});

export const corporateRegistrationProceduresFileSchema = z.object({
  jurisdiction: z.string().default("JP"),
  updated: isoDate.optional(),
  procedures: z.array(
    z.object({
      id: z.string().min(1),
      name_ja: z.string().min(1),
      name_en: z.string().optional(),
      category: corporateRegistrationProcedureCategory,
      legal_basis: z.string().optional(),
      registry_office: z.string().optional(),
      form_ids: z.array(z.string()).min(1),
      fee_note: z.string().optional(),
      official_urls: z.array(z.string().url()).optional(),
      notes: z.string().optional(),
    })
  ),
});

export const corporateRegistrationFormsFileSchema = z.object({
  sources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url(),
        type: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .default([]),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      template: z.string(),
      procedure_ids: z.array(z.string()).optional(),
      legal_basis: z.string().optional(),
      when_required: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const corporateRegistrationFieldMapFileSchema = z.object({
  mappings: z.array(
    z.object({
      form_field: z.string(),
      source: z.string(),
      format: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

const incorporationBlockSchema = z.object({
  company_name: z.string().min(1),
  capital_yen: z.number().int().nonnegative(),
  head_office: z.string().min(1),
  purposes: z.array(z.string()).min(1),
  promoters: z.array(personBlockSchema).min(1),
  directors: z.array(personBlockSchema).min(1),
  has_board: z.boolean().default(true),
  fiscal_year_end: z.string().optional(),
});

const officerChangeBlockSchema = z.object({
  resolution_date: isoDate,
  resolution_body: z.enum(["board", "shareholders"]).default("shareholders"),
  resigning: z.array(personBlockSchema).default([]),
  appointing: z.array(personBlockSchema).default([]),
});

const headOfficeChangeBlockSchema = z.object({
  resolution_date: isoDate,
  old_address: z.string().min(1),
  new_address: z.string().min(1),
  cross_bureau: z.boolean().default(false),
});

const tradeNameChangeBlockSchema = z.object({
  resolution_date: isoDate,
  old_name: z.string().min(1),
  new_name: z.string().min(1),
});

const purposeChangeBlockSchema = z.object({
  resolution_date: isoDate,
  old_purposes: z.array(z.string()).default([]),
  new_purposes: z.array(z.string()).min(1),
});

const capitalChangeBlockSchema = z.object({
  resolution_date: isoDate,
  old_capital_yen: z.number().int().nonnegative(),
  new_capital_yen: z.number().int().nonnegative(),
  method: z.enum(["cash", "asset", "surplus", "amalgamation", "other"]).optional(),
});

const dissolutionBlockSchema = z.object({
  resolution_date: isoDate,
  resolution_body: z.enum(["shareholders", "board"]).default("shareholders"),
  liquidator: personBlockSchema,
  reason: z.string().optional(),
});

const branchChangeBlockSchema = z.object({
  resolution_date: isoDate,
  branch_name: z.string().min(1),
  branch_address: z.string().min(1),
  action: z.enum(["establish", "abolish", "relocate"]).default("establish"),
  old_branch_address: z.string().optional(),
});

const corporateReorgBlockSchema = z.object({
  resolution_date: isoDate,
  reorg_type: z.enum(["merger", "split"]),
  counterparty_name: z.string().min(1),
  effective_date: isoDate.optional(),
  surviving_entity: z.string().optional(),
});

const liquidationCompletionBlockSchema = z.object({
  resolution_date: isoDate,
  liquidator: personBlockSchema,
});

export const corporateRegistrationCaseRegistryFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  cases: z.array(
    z.object({
      id: z.string().min(1),
      procedure_id: z.string().min(1),
      status: corporateRegistrationCaseStatus.default("draft"),
      filing_date: isoDate,
      docs_root: z.string().optional(),
      registry_office: z.string().default("東京法務局"),
      reference_number: z.string().optional(),
      agent_name: z.string().optional(),
      agent_registration_no: z.string().optional(),
      simplified: z.boolean().default(true),
      incorporation: incorporationBlockSchema.optional(),
      officer_change: officerChangeBlockSchema.optional(),
      head_office_change: headOfficeChangeBlockSchema.optional(),
      trade_name_change: tradeNameChangeBlockSchema.optional(),
      purpose_change: purposeChangeBlockSchema.optional(),
      capital_change: capitalChangeBlockSchema.optional(),
      branch_change: branchChangeBlockSchema.optional(),
      corporate_reorg: corporateReorgBlockSchema.optional(),
      dissolution: dissolutionBlockSchema.optional(),
      liquidation_completion: liquidationCompletionBlockSchema.optional(),
      notes: z.string().optional(),
    })
  ),
});

export type CorporateRegistrationProcedure = z.infer<
  typeof corporateRegistrationProceduresFileSchema
>["procedures"][number];
export type CorporateRegistrationCase = z.infer<
  typeof corporateRegistrationCaseRegistryFileSchema
>["cases"][number];
export type CorporateRegistrationForm = z.infer<
  typeof corporateRegistrationFormsFileSchema
>["forms"][number];
