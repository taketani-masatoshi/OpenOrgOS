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

export const qmsDocumentTier = z.enum(["1", "2", "3", "4"]);

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
  jmdn_code: z.string().optional(),
  approval_number: z.string().optional(),
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

export type MedicalDeviceBusinessRole = z.output<typeof medicalDeviceBusinessRole>;
export type MedicalDeviceObligationsFile = z.output<typeof medicalDeviceObligationsFileSchema>;
export type MedicalDeviceQmsCatalogFile = z.output<typeof medicalDeviceQmsCatalogFileSchema>;
export type MedicalDeviceGvpCatalogFile = z.output<typeof medicalDeviceGvpCatalogFileSchema>;
export type MedicalDeviceLicenseRegistryFile = z.output<typeof medicalDeviceLicenseRegistryFileSchema>;
export type MedicalDeviceMasterFile = z.output<typeof medicalDeviceMasterFileSchema>;
export type MedicalDeviceLedgerRegistryFile = z.output<typeof medicalDeviceLedgerRegistryFileSchema>;
