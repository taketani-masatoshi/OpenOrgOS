import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const medicalDeviceBusinessRole = z.enum([
  "manufacturing",
  "mah",
  "distribution",
]);

export const medicalDeviceLicenseStatus = z.enum([
  "active",
  "pending",
  "suspended",
  "expired",
]);

export const medicalDeviceClass = z.enum(["I", "II", "III", "IV"]);

export const medicalDeviceRegulatoryPathway = z.enum([
  "notification",
  "certification",
  "approval",
]);

export const qmsDocumentTier = z.enum(["1", "2", "3", "4"]);

/** Open / closed style status used across operational ledgers. */
export const medicalDeviceCaseStatus = z.enum([
  "open",
  "in_progress",
  "effectiveness_check",
  "pending_approval",
  "closed",
  "cancelled",
]);

/** CAPA post-implementation effectiveness verification result. */
export const medicalDeviceEffectivenessResult = z.enum([
  "pending",
  "effective",
  "ineffective",
]);

export const medicalDeviceSeverity = z.enum(["minor", "major", "critical"]);

export const medicalDeviceDefectClass = z.enum([
  "quality",
  "safety",
  "labeling",
  "use_error",
  "other",
]);

export const medicalDeviceAeSeriousness = z.enum(["death", "serious", "other"]);

export const medicalDeviceDocControlStatus = z.enum([
  "draft",
  "in_review",
  "approved",
  "obsolete",
]);

export const medicalDeviceChangeType = z.enum([
  "design",
  "process",
  "labeling",
  "supplier",
  "qms_doc",
]);

export const medicalDeviceCapaSource = z.enum([
  "complaint",
  "ae",
  "audit",
  "change",
  "pms",
]);

export const medicalDeviceAuthority = z.enum([
  "pmda",
  "prefecture",
  "cert_body",
  "other",
]);

export const medicalDeviceApplicationKind = z.enum([
  "certification",
  "partial-change",
  "notification",
]);

/** Org approval subject_type values for medical-device QMS/GVP gates. */
export const MEDICAL_DEVICE_APPROVAL_SUBJECTS = {
  docRevision: "medical_device.doc_revision",
  capaClose: "medical_device.capa_close",
  changeImplement: "medical_device.change_implement",
  gvpReport: "medical_device.gvp_report",
} as const;

export type MedicalDeviceApprovalSubject =
  (typeof MEDICAL_DEVICE_APPROVAL_SUBJECTS)[keyof typeof MEDICAL_DEVICE_APPROVAL_SUBJECTS];

/**
 * GVP reporting lead times (calendar days) from receipt — deterministic constants for tests.
 * Human files with PMDA; OrgOS only tracks due dates.
 */
export const GVP_REPORT_LEAD_DAYS = {
  death: 7,
  serious: 15,
  other: 30,
} as const;

export const medicalDeviceObligationsFileSchema = z.object({
  jurisdiction: z.string().default("JP"),
  updated: isoDate.optional(),
  roles: z.array(
    z.object({
      id: medicalDeviceBusinessRole,
      name_ja: z.string().min(1),
      legal_basis: z.string().min(1),
      permit_type: z.string().min(1),
      qms_basis: z.string().optional(),
      gvp_required: z.boolean().default(false),
      record_retention_years: z.number().int().positive().optional(),
      official_urls: z.array(z.string().url()).optional(),
      notes: z.string().optional(),
    })
  ),
  obligations: z.array(
    z.object({
      id: z.string().min(1),
      role_ids: z.array(medicalDeviceBusinessRole).min(1),
      title: z.string().min(1),
      category: z.enum([
        "permit",
        "qms",
        "gvp",
        "record",
        "reporting",
        "post_market",
      ]),
      frequency: z.string().optional(),
      evidence_ledger: z.string().optional(),
      iso_refs: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
  ),
});

export const medicalDeviceSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["guidance", "template", "law", "standard"]).optional(),
      notes: z.string().optional(),
    })
  ),
});

export const medicalDeviceQmsCatalogFileSchema = z.object({
  hierarchy: z.array(
    z.object({
      tier: qmsDocumentTier,
      label: z.string(),
      description: z.string().optional(),
    })
  ),
  documents: z.array(
    z.object({
      id: z.string().min(1),
      tier: qmsDocumentTier,
      title: z.string().min(1),
      doc_number: z.string().optional(),
      template: z.string().min(1),
      role_ids: z.array(medicalDeviceBusinessRole).default([]),
      iso_refs: z.array(z.string()).optional(),
      reg_refs: z.array(z.string()).optional(),
      when_required: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const medicalDeviceGvpCatalogFileSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      doc_number: z.string().optional(),
      template: z.string().min(1),
      gvp_chapter: z.string().optional(),
      role_ids: z.array(medicalDeviceBusinessRole).default(["mah", "distribution"]),
      when_required: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const medicalDeviceLicenseEntrySchema = z.object({
  id: z.string().min(1),
  role: medicalDeviceBusinessRole,
  permit_number: z.string().min(1),
  issuer: z.string().min(1),
  issued_on: isoDate,
  expires_on: isoDate.optional(),
  site_name: z.string().optional(),
  site_address_ref: z.string().optional(),
  scope: z.string().optional(),
  status: medicalDeviceLicenseStatus.default("active"),
  notes: z.string().optional(),
});

export const medicalDeviceLicenseRegistryFileSchema = z.object({
  as_of: isoDate.optional(),
  licenses: z.array(medicalDeviceLicenseEntrySchema),
});

export const medicalDeviceMasterEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  class: medicalDeviceClass,
  general_name: z.string().optional(),
  jmdn_code: z.string().optional(),
  approval_number: z.string().optional(),
  regulatory_pathway: medicalDeviceRegulatoryPathway.optional(),
  certification_body: z.string().optional(),
  issued_on: isoDate.optional(),
  expires_on: isoDate.optional(),
  renewal_lead_days: z.number().int().positive().default(180),
  udi_di: z.string().optional(),
  manufacturer_ref: z.string().optional(),
  mah_ref: z.string().optional(),
  storage_conditions: z.string().optional(),
  shelf_life_months: z.number().int().positive().optional(),
  status: z.enum(["active", "discontinued", "recalled"]).default("active"),
  notes: z.string().optional(),
});

export const medicalDeviceMasterFileSchema = z.object({
  devices: z.array(medicalDeviceMasterEntrySchema),
});

export const medicalDeviceLedgerType = z.enum([
  "distribution",
  "manufacturing_batch",
  "complaint",
  "adverse_event",
  "maintenance",
  "training",
  "document_control",
  "change_control",
  "capa",
  "pms",
  "authority_inquiry",
]);

export const medicalDeviceLedgerRegistryFileSchema = z.object({
  ledgers: z.array(
    z.object({
      id: z.string().min(1),
      type: medicalDeviceLedgerType,
      title: z.string().min(1),
      data_file: z.string().min(1),
      retention_years: z.number().int().positive().optional(),
      role_ids: z.array(medicalDeviceBusinessRole).default([]),
      notes: z.string().optional(),
    })
  ),
});

/** --- Typed ledger entries --- */

export const medicalDeviceComplaintEntrySchema = z.object({
  id: z.string().min(1),
  received_on: isoDate,
  device_id: z.string().optional(),
  source: z.string().optional(),
  summary: z.string().optional(),
  severity: medicalDeviceSeverity.default("minor"),
  defect_class: medicalDeviceDefectClass.default("other"),
  reportable: z.boolean().default(false),
  status: medicalDeviceCaseStatus.default("open"),
  capa_id: z.string().optional(),
  ae_id: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalDeviceAdverseEventEntrySchema = z.object({
  id: z.string().min(1),
  received_on: isoDate,
  device_id: z.string().optional(),
  source: z.string().optional(),
  summary: z.string().optional(),
  severity: medicalDeviceSeverity.default("major"),
  defect_class: medicalDeviceDefectClass.default("safety"),
  seriousness: medicalDeviceAeSeriousness.default("other"),
  reportable: z.boolean().default(true),
  gvp_due_on: isoDate.optional(),
  escalated_at: z.string().optional(),
  report_filed_on: isoDate.optional(),
  status: medicalDeviceCaseStatus.default("open"),
  capa_id: z.string().optional(),
  approval_id: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalDeviceDocumentControlEntrySchema = z.object({
  id: z.string().min(1),
  doc_id: z.string().min(1),
  version: z.string().min(1),
  title: z.string().optional(),
  status: medicalDeviceDocControlStatus.default("draft"),
  effective_on: isoDate.optional(),
  supersedes: z.string().optional(),
  path: z.string().optional(),
  approval_id: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalDeviceTrainingEntrySchema = z.object({
  id: z.string().min(1),
  session_id: z.string().optional(),
  topic: z.string().min(1),
  held_on: isoDate,
  attendee_refs: z.array(z.string()).default([]),
  trainer_ref: z.string().optional(),
  competency: z.string().optional(),
  next_due_on: isoDate.optional(),
  status: medicalDeviceCaseStatus.default("closed"),
  notes: z.string().optional(),
});

export const medicalDeviceChangeControlEntrySchema = z.object({
  id: z.string().min(1),
  device_id: z.string().optional(),
  change_type: medicalDeviceChangeType,
  title: z.string().min(1),
  risk_review: z.string().optional(),
  opened_on: isoDate,
  status: medicalDeviceCaseStatus.default("open"),
  capa_id: z.string().optional(),
  approval_id: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalDeviceCapaEntrySchema = z.object({
  id: z.string().min(1),
  source: medicalDeviceCapaSource,
  source_ref: z.string().optional(),
  title: z.string().min(1),
  root_cause: z.string().optional(),
  action: z.string().optional(),
  opened_on: isoDate,
  due_on: isoDate.optional(),
  effectiveness_check_on: isoDate.optional(),
  effectiveness_result: medicalDeviceEffectivenessResult.optional(),
  status: medicalDeviceCaseStatus.default("open"),
  approval_id: z.string().optional(),
  notes: z.string().optional(),
});

export const medicalDevicePmsEntrySchema = z.object({
  id: z.string().min(1),
  device_id: z.string().min(1),
  plan_period: z.string().min(1),
  data_sources: z.array(z.string()).default([]),
  next_review_on: isoDate.optional(),
  opened_on: isoDate,
  status: medicalDeviceCaseStatus.default("open"),
  notes: z.string().optional(),
});

export const medicalDeviceAuthorityInquiryEntrySchema = z.object({
  id: z.string().min(1),
  authority: medicalDeviceAuthority,
  title: z.string().min(1),
  received_on: isoDate,
  due_on: isoDate.optional(),
  response_draft_path: z.string().optional(),
  responded_on: isoDate.optional(),
  status: medicalDeviceCaseStatus.default("open"),
  notes: z.string().optional(),
});

export const medicalDeviceDistributionEntrySchema = z.object({
  id: z.string().min(1),
  shipped_on: isoDate,
  device_id: z.string().min(1),
  lot: z.string().min(1),
  quantity: z.number().positive().optional(),
  status: medicalDeviceCaseStatus.default("closed"),
  notes: z.string().optional(),
});

export const medicalDeviceManufacturingBatchEntrySchema = z.object({
  id: z.string().min(1),
  manufactured_on: isoDate,
  device_id: z.string().min(1),
  lot: z.string().min(1),
  quantity: z.number().positive().optional(),
  status: medicalDeviceCaseStatus.default("closed"),
  notes: z.string().optional(),
});

export const medicalDeviceMaintenanceEntrySchema = z.object({
  id: z.string().min(1),
  performed_on: isoDate.optional(),
  device_id: z.string().optional(),
  status: medicalDeviceCaseStatus.default("closed"),
  notes: z.string().optional(),
}).passthrough();

const ledgerEntriesByType = {
  complaint: medicalDeviceComplaintEntrySchema,
  adverse_event: medicalDeviceAdverseEventEntrySchema,
  document_control: medicalDeviceDocumentControlEntrySchema,
  training: medicalDeviceTrainingEntrySchema,
  change_control: medicalDeviceChangeControlEntrySchema,
  capa: medicalDeviceCapaEntrySchema,
  pms: medicalDevicePmsEntrySchema,
  authority_inquiry: medicalDeviceAuthorityInquiryEntrySchema,
  distribution: medicalDeviceDistributionEntrySchema,
  manufacturing_batch: medicalDeviceManufacturingBatchEntrySchema,
  maintenance: medicalDeviceMaintenanceEntrySchema,
} as const;

export function medicalDeviceLedgerFileSchemaFor(
  type: z.output<typeof medicalDeviceLedgerType>
) {
  const entrySchema =
    ledgerEntriesByType[type as keyof typeof ledgerEntriesByType] ??
    z.record(z.unknown());
  return z.object({
    version: z.union([z.literal(1), z.literal("1")]).default("1"),
    entries: z.array(entrySchema).default([]),
  });
}

/** Loose file schema for list/status (accepts legacy untyped entries). */
export const medicalDeviceLedgerFileSchema = z.object({
  version: z.union([z.literal(1), z.literal("1")]).default("1"),
  entries: z.array(z.record(z.unknown())).default([]),
});

export const medicalDeviceAuditEventSchema = z.object({
  timestamp: z.string().min(1),
  tenant: z.string().min(1),
  actor: z.string().optional(),
  op: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  summary: z.string().min(1),
  detail: z.record(z.unknown()).optional(),
});

export type MedicalDeviceBusinessRole = z.output<typeof medicalDeviceBusinessRole>;
export type MedicalDeviceObligationsFile = z.output<typeof medicalDeviceObligationsFileSchema>;
export type MedicalDeviceQmsCatalogFile = z.output<typeof medicalDeviceQmsCatalogFileSchema>;
export type MedicalDeviceGvpCatalogFile = z.output<typeof medicalDeviceGvpCatalogFileSchema>;
export type MedicalDeviceLicenseRegistryFile = z.output<typeof medicalDeviceLicenseRegistryFileSchema>;
export type MedicalDeviceMasterFile = z.output<typeof medicalDeviceMasterFileSchema>;
export type MedicalDeviceMasterEntry = z.output<typeof medicalDeviceMasterEntrySchema>;
export type MedicalDeviceLedgerRegistryFile = z.output<typeof medicalDeviceLedgerRegistryFileSchema>;
export type MedicalDeviceLedgerType = z.output<typeof medicalDeviceLedgerType>;
export type MedicalDeviceComplaintEntry = z.output<typeof medicalDeviceComplaintEntrySchema>;
export type MedicalDeviceAdverseEventEntry = z.output<typeof medicalDeviceAdverseEventEntrySchema>;
export type MedicalDeviceDocumentControlEntry = z.output<
  typeof medicalDeviceDocumentControlEntrySchema
>;
export type MedicalDeviceTrainingEntry = z.output<typeof medicalDeviceTrainingEntrySchema>;
export type MedicalDeviceChangeControlEntry = z.output<
  typeof medicalDeviceChangeControlEntrySchema
>;
export type MedicalDeviceCapaEntry = z.output<typeof medicalDeviceCapaEntrySchema>;
export type MedicalDevicePmsEntry = z.output<typeof medicalDevicePmsEntrySchema>;
export type MedicalDeviceAuthorityInquiryEntry = z.output<
  typeof medicalDeviceAuthorityInquiryEntrySchema
>;
export type MedicalDeviceAuditEvent = z.output<typeof medicalDeviceAuditEventSchema>;
export type MedicalDeviceAeSeriousness = z.output<typeof medicalDeviceAeSeriousness>;
export type MedicalDeviceApplicationKind = z.output<typeof medicalDeviceApplicationKind>;
export type MedicalDeviceCaseStatus = z.output<typeof medicalDeviceCaseStatus>;
