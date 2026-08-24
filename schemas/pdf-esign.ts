import { z } from "zod";

export const PDF_ESIGN_CHANNEL = "pdf_esign" as const;

/** Production providers: national DigiDoc or non-electronic manual. Commercial ESP forbidden (ADR 0014). */
export const pdfEsignProviderIdSchema = z.enum(["digidoc", "manual"]);

export const pdfEsignStatusSchema = z.enum([
  "draft",
  "sent",
  "partially_signed",
  "completed",
  "cancelled",
  "failed",
]);

/** Catalog id for national eID stack — company jurisdiction may differ (cross-border). */
export const nationalEidStackIdSchema = z.enum(["EE/digidoc"]);

export const pdfEsignProviderSchema = z.object({
  id: pdfEsignProviderIdSchema,
  name: z.string().min(1),
  national_eid_stack: nationalEidStackIdSchema.optional(),
  base_url: z.string().optional(),
  notes: z.string().optional(),
});

export const pdfEsignProvidersFileSchema = z.object({
  version: z.literal(1).default(1),
  channel: z.literal(PDF_ESIGN_CHANNEL).default(PDF_ESIGN_CHANNEL),
  providers: z.array(pdfEsignProviderSchema).min(1),
  default_provider: pdfEsignProviderIdSchema.default("digidoc"),
});

/** Tenant choice of national signing stack (independent of company seat jurisdiction). */
export const nationalEidConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** e.g. EE/digidoc — JP company may still select EE DigiDoc via e-Residency */
  active_stack: nationalEidStackIdSchema.default("EE/digidoc"),
  siva_base_url: z.string().optional(),
  digidoc_sidecar_url: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * DigiDoc stack runtime (SiVa + digidoc4j sidecar).
 * Optional file `data/pdf-esign/digidoc.yaml` — merges over national-eid.yaml fields.
 */
export const digidocRuntimeConfigSchema = z.object({
  version: z.literal(1).default(1),
  siva_base_url: z.string().optional(),
  digidoc_sidecar_url: z.string().optional(),
  /**
   * Allow http://127.0.0.1 and http://localhost for local SiVa / sidecar only.
   * Production must use HTTPS. Default false.
   */
  allow_http_loopback: z.boolean().default(false),
  /** Timeout for SiVa /validate (ms). */
  siva_timeout_ms: z.number().int().positive().default(30_000),
  /** Timeout for digidoc sidecar calls (ms). */
  sidecar_timeout_ms: z.number().int().positive().default(60_000),
  /** Max request PDF size for sidecar create (bytes). */
  max_pdf_bytes: z.number().int().positive().default(25 * 1024 * 1024),
  /** Max ASiC / SiVa container bytes. */
  max_asice_bytes: z.number().int().positive().default(40 * 1024 * 1024),
  notes: z.string().optional(),
});

/**
 * mock = CI / unit only (never completes a case as nationally verified).
 * live = real SiVa; default when mode is unset.
 */
export const sivaModeSchema = z.enum(["mock", "live"]);

export const pdfEsignCaseSchema = z.object({
  id: z.string().regex(/^ES-\d{4}-\d{3}$/),
  channel: z.literal(PDF_ESIGN_CHANNEL).default(PDF_ESIGN_CHANNEL),
  title: z.string().min(1),
  status: pdfEsignStatusSchema.default("draft"),
  provider_id: pdfEsignProviderIdSchema,
  /** Which national stack was used — audit trail for cross-border */
  national_eid_stack: nationalEidStackIdSchema.optional(),
  pdf_path: z.string().min(1),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  byte_length: z.number().int().positive().optional(),
  signed_pdf_path: z.string().optional(),
  signed_content_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** DigiDoc ASiC-E container (signed) */
  container_path: z.string().optional(),
  container_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** Unsigned ASiC skeleton from digidoc4j sidecar */
  unsigned_asice_path: z.string().optional(),
  unsigned_asice_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /** mock | live — live TOTAL-PASSED required for completed */
  siva_mode: sivaModeSchema.optional(),
  siva_indication: z.string().optional(),
  siva_validated_at: z.string().optional(),
  /** SHA-256 of canonical SiVa summary (not full report — L1 audit) */
  siva_response_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  siva_signatures_count: z.number().int().nonnegative().optional(),
  siva_valid_signatures_count: z.number().int().nonnegative().optional(),
  siva_reason: z.string().optional(),
  external_ref: z.string().optional(),
  deep_link_url: z.string().optional(),
  work_dir: z.string().optional(),
  contract_id: z.string().optional(),
  approval_id: z.string().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  notes: z.string().optional(),
});

export const pdfEsignCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  channel: z.literal(PDF_ESIGN_CHANNEL).default(PDF_ESIGN_CHANNEL),
  cases: z.array(pdfEsignCaseSchema).default([]),
});

/** SiVa Simple report subset (validated before trust decision). */
export const sivaSignatureSchema = z.object({
  indication: z.string().min(1),
  id: z.string().optional(),
  signatureLevel: z.string().optional(),
  signedBy: z.string().optional(),
});

export const sivaValidationConclusionSchema = z.object({
  validationTime: z.string().optional(),
  signaturesCount: z.number().int().nonnegative(),
  validSignaturesCount: z.number().int().nonnegative(),
  signatures: z.array(sivaSignatureSchema).optional(),
  validatedDocument: z
    .object({
      filename: z.string().optional(),
    })
    .optional(),
  signatureForm: z.string().optional(),
});

export const sivaValidateResponseSchema = z.object({
  validationReport: z.object({
    validationConclusion: sivaValidationConclusionSchema,
  }),
});

export type PdfEsignProviderId = z.output<typeof pdfEsignProviderIdSchema>;
export type PdfEsignStatus = z.output<typeof pdfEsignStatusSchema>;
export type NationalEidStackId = z.output<typeof nationalEidStackIdSchema>;
export type PdfEsignProvider = z.output<typeof pdfEsignProviderSchema>;
export type PdfEsignProvidersFile = z.output<typeof pdfEsignProvidersFileSchema>;
export type NationalEidConfig = z.output<typeof nationalEidConfigSchema>;
export type DigidocRuntimeConfig = z.output<typeof digidocRuntimeConfigSchema>;
export type SivaMode = z.output<typeof sivaModeSchema>;
export type PdfEsignCase = z.output<typeof pdfEsignCaseSchema>;
export type PdfEsignCasesFile = z.output<typeof pdfEsignCasesFileSchema>;
export type SivaValidationConclusion = z.output<typeof sivaValidationConclusionSchema>;
