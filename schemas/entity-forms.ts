import { z } from "zod";

/** Org-wide category — `professional_corporation` is populated primarily under JP pack. */
export const entityFormCategorySchema = z.enum([
  "companies_act",
  "partnership",
  "general_incorporated",
  "nonprofit",
  "special_corporation",
  "professional_corporation",
  "condominium",
  "unincorporated",
]);

export type EntityFormCategory = z.output<typeof entityFormCategorySchema>;

export const entityFormEntrySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  name_en: z.string().optional(),
  name_ja: z.string().optional(),
  liability: z.enum(["limited", "unlimited", "mixed", "none"]).optional(),
  governance: z.record(z.string(), z.unknown()).optional(),
  identifiers: z.array(z.string()).optional(),
  status: z.enum(["active", "stub", "legacy", "planned"]).default("active"),
  /** Grouping for CLI · pack docs — not all categories exist in every jurisdiction. */
  category: entityFormCategorySchema.optional(),
  /** When set, form is selectable only under these ISO 3166-1 alpha-2 jurisdiction codes. */
  jurisdiction_exclusive: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  /** Governing statute (Japanese label) — JP pack professional / special corporations. */
  governing_law_ja: z.string().optional(),
  notes: z.string().optional(),
});

export const entityFormsFileSchema = z.object({
  jurisdiction: z.string().optional(),
  legal_subdivision: z.string().optional(),
  forms: z.array(entityFormEntrySchema).min(1),
});

export type EntityFormEntry = z.output<typeof entityFormEntrySchema>;
export type EntityFormsFile = z.output<typeof entityFormsFileSchema>;
