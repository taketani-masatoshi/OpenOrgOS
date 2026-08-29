import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const certificationTypeSchema = z.object({
  id: z.string().min(1),
  name_ja: z.string().min(1),
  name_en: z.string().optional(),
  scheme: z.string().optional(),
  issuer_label_ja: z.string().optional(),
  reference_url: z.string().optional(),
  notes: z.string().optional(),
});

export const certificationTypesCatalogSchema = z.object({
  as_of: isoDate.optional(),
  types: z.array(certificationTypeSchema).default([]),
});

export const certificationStatusSchema = z.enum([
  "planned",
  "in_progress",
  "active",
  "expired",
  "revoked",
]);

export const certificationInstanceSchema = z.object({
  id: z.string().min(1),
  cert_type_id: z.string().min(1),
  status: certificationStatusSchema,
  application_id: z.string().optional(),
  certificate_number: z.string().optional(),
  issued_on: isoDate.optional(),
  expires_on: isoDate.optional(),
  evidence_path: z.string().optional(),
  notes: z.string().optional(),
});

export type CertificationInstance = z.output<typeof certificationInstanceSchema>;

export const certificationRegistryFileSchema = z.object({
  as_of: isoDate.optional(),
  certifications: z.array(certificationInstanceSchema).default([]),
});
