import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const inspectionTypeSchema = z.object({
  id: z.string().min(1),
  name_ja: z.string().min(1),
  legal_basis: z.string().optional(),
  authority_ja: z.string().optional(),
  notes: z.string().optional(),
});

export const inspectionTypesCatalogSchema = z.object({
  as_of: isoDate.optional(),
  types: z.array(inspectionTypeSchema).default([]),
});

export const inspectionStatusSchema = z.enum([
  "scheduled",
  "passed",
  "failed",
  "corrected",
]);

export const inspectionInstanceSchema = z.object({
  id: z.string().min(1),
  inspection_type_id: z.string().min(1),
  status: inspectionStatusSchema,
  scheduled_on: isoDate.optional(),
  completed_on: isoDate.optional(),
  property_id: z.string().optional(),
  related_permit_id: z.string().optional(),
  evidence_path: z.string().optional(),
  notes: z.string().optional(),
});

export type InspectionInstance = z.output<typeof inspectionInstanceSchema>;

export const inspectionRegistryFileSchema = z.object({
  as_of: isoDate.optional(),
  inspections: z.array(inspectionInstanceSchema).default([]),
});
