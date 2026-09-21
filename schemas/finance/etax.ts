import { z } from "zod";

export const etaxTaxTypeSchema = z.enum(["corporate_tax", "consumption_tax"]);
export const etaxSubmissionStatusSchema = z.enum([
  "prepared",
  "validated",
  "approved",
  "signed",
  "sending",
  "received",
  "accepted",
  "rejected",
  "cancelled",
]);
export const etaxFilingKindSchema = z.enum(["original", "amended", "corrected"]);
export const etaxAttachmentSchema = z.object({
  document_id: z.string().min(1),
  document_type: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const etaxSpecEntrySchema = z.object({
  id: z.string().min(1),
  tax_type: etaxTaxTypeSchema,
  procedure_id: z.string().min(1),
  form_revision: z.string().min(1),
  effective_from: z.string().date(),
  effective_to: z.string().date().optional(),
  source_url: z.string().url(),
  checked_at: z.string().datetime(),
  source_last_modified: z.string().datetime().optional(),
  xsd_path: z.string().min(1),
  xsd_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mapping_revision: z.string().min(1),
  transmission_profile: z.string().min(1),
  certified: z.boolean().default(false),
});

export const etaxSpecCatalogSchema = z.object({
  schema: z.literal("orgos.jp.etax-spec-catalog.v1"),
  updated_at: z.string().datetime(),
  entries: z.array(etaxSpecEntrySchema),
});

export const etaxOfficialPackageSchema = z.object({
  schema: z.literal("orgos.jp.etax-official-package.v1"),
  package_id: z.string().min(1),
  tax_type: etaxTaxTypeSchema,
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  procedure_id: z.string().min(1),
  spec_id: z.string().min(1),
  form_revision: z.string().min(1),
  filing_kind: etaxFilingKindSchema.default("original"),
  prior_receipt_number: z.string().min(1).optional(),
  payload_path: z.string().min(1),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  package_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  xsd_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  validated_at: z.string().datetime(),
  validator: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  attachments: z.array(etaxAttachmentSchema).default([]),
}).superRefine((value, ctx) => {
  if (value.filing_kind !== "original" && !value.prior_receipt_number) {
    ctx.addIssue({ code: "custom", path: ["prior_receipt_number"], message: "amended/corrected filing requires prior receipt number" });
  }
  if (value.filing_kind === "original" && value.prior_receipt_number) {
    ctx.addIssue({ code: "custom", path: ["prior_receipt_number"], message: "original filing cannot reference a prior receipt" });
  }
});

export const etaxSubmissionRecordSchema = z.object({
  schema: z.literal("orgos.jp.etax-submission.v1"),
  submission_id: z.string().min(1),
  revision: z.number().int().nonnegative().default(0),
  idempotency_key: z.string().min(1),
  status: etaxSubmissionStatusSchema,
  package: etaxOfficialPackageSchema,
  approval: z.object({
    operator_id: z.string().min(1),
    approved_at: z.string().datetime(),
    payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    package_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).optional(),
  signature: z.object({
    algorithm: z.string().min(1),
    certificate_fingerprint_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signed_payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signed_package_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signature_path: z.string().min(1),
    signature_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    signed_at: z.string().datetime(),
  }).optional(),
  transport: z.object({
    adapter: z.string().min(1),
    request_id: z.string().min(1),
    sent_at: z.string().datetime(),
  }).optional(),
  receipt: z.object({
    receipt_number: z.string().min(1),
    received_at: z.string().datetime(),
    tax_office: z.string().min(1),
    result: z.enum(["received", "accepted", "rejected"]),
    message: z.string().optional(),
    xtx_path: z.string().min(1).optional(),
    xtx_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).optional(),
  attempts: z.array(z.object({
    attempted_at: z.string().datetime(),
    request_id: z.string().min(1),
    outcome: z.enum(["started", "received", "failed"]),
    detail: z.string().optional(),
  })).default([]),
  retention_until: z.string().date(),
  legal_hold: z.boolean().default(false),
  cancellation: z.object({ operator_id: z.string().min(1), cancelled_at: z.string().datetime(), reason: z.string().min(1) }).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type EtaxTaxType = z.output<typeof etaxTaxTypeSchema>;
export type EtaxSpecEntry = z.output<typeof etaxSpecEntrySchema>;
export type EtaxSpecCatalog = z.output<typeof etaxSpecCatalogSchema>;
export type EtaxOfficialPackage = z.output<typeof etaxOfficialPackageSchema>;
export type EtaxSubmissionRecord = z.output<typeof etaxSubmissionRecordSchema>;
export type EtaxFilingKind = z.output<typeof etaxFilingKindSchema>;
