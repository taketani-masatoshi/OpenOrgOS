import { z } from "zod";

export const invoiceRegistrationCatalogRowSchema = z.object({
  t_number: z.string().regex(/^T\d{13}$/),
  legal_name: z.string().min(1),
  status: z.enum(["verified", "revoked", "unknown"]),
  verified_as_of: z.string().date(),
  source_ref: z.string().min(1),
});

export const invoiceRegistrationCatalogSchema = z.object({
  version: z.literal(1).default(1),
  as_of: z.string().date().optional(),
  source_checked_at: z.string().datetime().optional(),
  next_review_by: z.string().date().optional(),
  official_source_url: z.string().url().optional(),
  registrations: z.array(invoiceRegistrationCatalogRowSchema).default([]),
});

export type InvoiceRegistrationCatalogRow = z.output<
  typeof invoiceRegistrationCatalogRowSchema
>;
export type InvoiceRegistrationCatalog = z.output<
  typeof invoiceRegistrationCatalogSchema
>;
