import { z } from "zod";

/**
 * Channel C — Org-managed Ed25519 seal over PDF digest.
 * Not national eID (B). Not multiparty Wire attestation (A).
 * Does not claim eIDAS / 電子署名法 certified signature.
 */
export const ORG_PDF_SIGN_CHANNEL = "org_pdf_sign" as const;

export const orgPdfSignStatusSchema = z.enum([
  "draft",
  "frozen",
  "signed",
  "void",
]);

export const orgPdfSignCaseSchema = z.object({
  id: z.string().regex(/^OS-\d{4}-\d{3}$/),
  channel: z.literal(ORG_PDF_SIGN_CHANNEL).default(ORG_PDF_SIGN_CHANNEL),
  title: z.string().min(1),
  status: orgPdfSignStatusSchema.default("draft"),
  pdf_path: z.string().min(1),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  byte_length: z.number().int().positive().optional(),
  algorithm: z.literal("sha256").default("sha256"),
  /** Org that sealed — usually local tenant id */
  org_id: z.string().min(1).optional(),
  public_key: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  signed_at: z.string().optional(),
  /** Sidecar manifest path (detached; no PDF bytes inside) */
  manifest_path: z.string().optional(),
  contract_id: z.string().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  notes: z.string().optional(),
  trust_disclaimer: z
    .string()
    .default(
      "org_managed_ed25519 — organizational seal only; not national eID / not claimed legal QES"
    ),
});

export const orgPdfSignCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  channel: z.literal(ORG_PDF_SIGN_CHANNEL).default(ORG_PDF_SIGN_CHANNEL),
  cases: z.array(orgPdfSignCaseSchema).default([]),
});

/** Detached verification package — never embeds PDF bytes */
export const orgPdfSignManifestSchema = z.object({
  schema: z.literal("steward.org_pdf_sign.v1"),
  channel: z.literal(ORG_PDF_SIGN_CHANNEL),
  trust_model: z.literal("org_managed_ed25519"),
  case_id: z.string(),
  title: z.string(),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/),
  byte_length: z.number().int().positive(),
  algorithm: z.literal("sha256"),
  org_id: z.string().min(1),
  public_key: z.string().min(1),
  signature: z.string().min(1),
  signed_at: z.string().min(1),
  disclaimer: z.string().min(1),
  exported_at: z.string().min(1),
});

export type OrgPdfSignStatus = z.output<typeof orgPdfSignStatusSchema>;
export type OrgPdfSignCase = z.output<typeof orgPdfSignCaseSchema>;
export type OrgPdfSignCasesFile = z.output<typeof orgPdfSignCasesFileSchema>;
export type OrgPdfSignManifest = z.output<typeof orgPdfSignManifestSchema>;
