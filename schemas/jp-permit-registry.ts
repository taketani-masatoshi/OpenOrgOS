import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const permitCategory = z.enum([
  "accommodation",
  "fire_building",
  "food_beverage",
  "real_estate",
  "construction",
  "transport",
  "medical_health",
  "pharmacy_clinic",
  "finance",
  "labor",
  "waste_environment",
  "security",
  "telecom_media",
  "import_export",
  "entertainment",
  "retail",
  "welfare_care",
  "education",
  "agriculture",
  "energy",
  "other",
]);

export const permitIssuerType = z.enum([
  "municipal",
  "prefectural",
  "national",
  "fire_department",
  "health_center",
  "tax_office",
  "mlit_regional",
  "pmda",
  "mhlw",
  "moj",
  "meti",
  "mlit",
  "fsa",
  "ppc",
  "customs",
  "police",
]);

export const permitInstanceStatus = z.enum([
  "draft",
  "applying",
  "pending",
  "active",
  "suspended",
  "expired",
  "revoked",
]);

export const permitApplicationStatus = z.enum([
  "draft",
  "preparing",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
]);

export const obligationCategory = z.enum([
  "permit",
  "renewal",
  "reporting",
  "inspection",
  "record",
  "training",
  "notification",
  "display",
  "fee",
]);

export const obligationInstanceStatus = z.enum([
  "not_applicable",
  "open",
  "due",
  "overdue",
  "fulfilled",
  "waived",
]);

export const permitTypeEntrySchema = z.object({
  id: z.string().min(1),
  category: permitCategory,
  name_ja: z.string().min(1),
  name_en: z.string().optional(),
  legal_basis: z.string().min(1),
  issuer_type: permitIssuerType,
  issuer_label_ja: z.string().optional(),
  prerequisite_type_ids: z.array(z.string()).default([]),
  property_scoped: z.boolean().default(false),
  site_scoped: z.boolean().default(false),
  renewal_cycle: z.string().optional(),
  binds_module: z.string().optional(),
  official_urls: z.array(z.string().url()).optional(),
  notes: z.string().optional(),
});

export const permitTypesCatalogFileSchema = z.object({
  jurisdiction: z.string().default("JP"),
  updated: isoDate.optional(),
  catalog_version: z.string().default("1"),
  sectors: z.array(
    z.object({
      id: z.string().min(1),
      name_ja: z.string().min(1),
      name_en: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
  permit_types: z.array(permitTypeEntrySchema).min(1),
});

export const permitObligationEntrySchema = z.object({
  id: z.string().min(1),
  permit_type_ids: z.array(z.string()).min(1),
  title: z.string().min(1),
  category: obligationCategory,
  frequency: z.string().optional(),
  lead_days: z.number().int().nonnegative().optional(),
  evidence_ledger: z.string().optional(),
  legal_basis: z.string().optional(),
  reg_refs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const permitObligationsCatalogFileSchema = z.object({
  jurisdiction: z.string().default("JP"),
  updated: isoDate.optional(),
  obligations: z.array(permitObligationEntrySchema),
});

export const permitInstanceEntrySchema = z.object({
  id: z.string().min(1),
  permit_type_id: z.string().min(1),
  status: permitInstanceStatus.default("draft"),
  permit_number: z.string().optional(),
  issuer: z.string().optional(),
  issued_on: isoDate.optional(),
  expires_on: isoDate.optional(),
  property_id: z
    .string()
    .regex(/^PROP-\d{3,}$/)
    .optional(),
  site_ref: z.string().optional(),
  application_id: z.string().optional(),
  evidence_path: z.string().optional(),
  notes: z.string().optional(),
});

export const permitRegistryFileSchema = z.object({
  as_of: isoDate.optional(),
  permits: z.array(permitInstanceEntrySchema).default([]),
});

/** Why the application exists — first acquisition, change notice, or renewal. */
export const permitApplicationPhase = z.enum(["obtain", "change", "renew"]);

export const permitApplicationEntrySchema = z.object({
  id: z.string().min(1),
  permit_type_id: z.string().min(1),
  status: permitApplicationStatus.default("draft"),
  phase: permitApplicationPhase.default("obtain"),
  handoff_id: z.string().optional(),
  target_permit_id: z.string().optional(),
  property_id: z
    .string()
    .regex(/^PROP-\d{3,}$/)
    .optional(),
  submitted_on: isoDate.optional(),
  docs_root: z.string().optional(),
  event_id: z.string().optional(),
  field_overrides: z.record(z.string()).optional(),
  notes: z.string().optional(),
});

export const permitApplicationRegistryFileSchema = z.object({
  as_of: isoDate.optional(),
  applications: z.array(permitApplicationEntrySchema).default([]),
});

export const permitObligationInstanceEntrySchema = z.object({
  id: z.string().min(1),
  obligation_id: z.string().min(1),
  permit_id: z.string().min(1),
  status: obligationInstanceStatus.default("open"),
  next_due: isoDate.optional(),
  last_fulfilled: isoDate.optional(),
  evidence_ref: z.string().optional(),
  notes: z.string().optional(),
});

export const permitObligationInstancesFileSchema = z.object({
  as_of: isoDate.optional(),
  instances: z.array(permitObligationInstanceEntrySchema).default([]),
});

export const permitSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      url: z.string().url(),
      category: permitCategory.optional(),
      type: z.enum(["law", "guidance", "portal", "form"]).optional(),
      notes: z.string().optional(),
    })
  ),
});

export const permitLedgerFileSchema = z.object({
  version: z.string().default("1"),
  entries: z.array(z.record(z.unknown())).default([]),
});

export const permitFormOutputFormat = z.enum(["md", "tex", "pdf"]);

export const permitFormEntrySchema = z.object({
  id: z.string().min(1),
  permit_type_ids: z.array(z.string()).min(1),
  name_ja: z.string().min(1),
  template_md: z.string().min(1),
  template_tex: z.string().optional(),
  required_fields: z.array(z.string()).min(1),
  official_form_url: z.string().url().optional(),
  official_form_notes: z.string().optional(),
  output_format: permitFormOutputFormat.default("tex"),
  submission: z
    .object({
      authority_label_ja: z.string().optional(),
      channel: z.enum(["counter", "mail", "online"]).optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export const permitFormsCatalogFileSchema = z.object({
  jurisdiction: z.string().default("JP"),
  updated: isoDate.optional(),
  forms: z.array(permitFormEntrySchema).min(1),
});

export const permitFieldMappingSchema = z.object({
  form_field: z.string().min(1),
  source: z.string().min(1),
  required: z.boolean().default(false),
  format: z.enum(["plain", "reiwa", "wareki"]).optional(),
  notes: z.string().optional(),
});

export const permitFieldMapFileSchema = z.object({
  mappings: z.array(permitFieldMappingSchema).min(1),
});

export const permitHandoffEntrySchema = z.object({
  id: z.string().min(1),
  application_id: z.string().min(1),
  contact_id: z.string().optional(),
  authority_label_ja: z.string().min(1),
  channel: z.string().min(1),
  sent_on: isoDate.optional(),
  notes: z.string().optional(),
});

export const permitHandoffFileSchema = z.object({
  as_of: isoDate.optional(),
  handoffs: z.array(permitHandoffEntrySchema).default([]),
});

export const permitApplicationDraftFileSchema = z.object({
  application_id: z.string().min(1),
  permit_type_id: z.string().min(1),
  form_id: z.string().min(1),
  property_id: z
    .string()
    .regex(/^PROP-\d{3,}$/)
    .optional(),
  status: permitApplicationStatus.default("preparing"),
  prepared_at: isoDate.optional(),
  auto_filled_from: z
    .object({
      company: z.string().optional(),
      property: z.string().optional(),
      field_map: z.string().optional(),
    })
    .optional(),
  fields: z.record(z.string()),
  manual_overrides: z.record(z.string()).default({}),
  checklist: z
    .object({
      last_run: isoDate.optional(),
      missing: z.array(z.string()).default([]),
      ready_for_export: z.boolean().default(false),
    })
    .optional(),
  export: z
    .object({
      md_path: z.string().optional(),
      tex_path: z.string().optional(),
      pdf_path: z.string().optional(),
      exported_at: isoDate.optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export type PermitCategory = z.output<typeof permitCategory>;
export type PermitTypeEntry = z.output<typeof permitTypeEntrySchema>;
export type PermitTypesCatalogFile = z.output<typeof permitTypesCatalogFileSchema>;
export type PermitObligationEntry = z.output<typeof permitObligationEntrySchema>;
export type PermitInstanceEntry = z.output<typeof permitInstanceEntrySchema>;
export type PermitApplicationEntry = z.output<typeof permitApplicationEntrySchema>;
export type PermitApplicationPhase = z.output<typeof permitApplicationPhase>;
export type PermitFormEntry = z.output<typeof permitFormEntrySchema>;
export type PermitFieldMapping = z.output<typeof permitFieldMappingSchema>;
export type PermitApplicationDraftFile = z.output<typeof permitApplicationDraftFileSchema>;
export type PermitHandoffEntry = z.output<typeof permitHandoffEntrySchema>;
