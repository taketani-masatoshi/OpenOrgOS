import { z } from "zod";

export const documentAttestationStatusSchema = z.enum([
  "draft",
  "frozen",
  "proposed",
  "partially_signed",
  "completed",
  "void",
]);

export const documentAttestationSignerSchema = z.object({
  org_id: z.string().min(1),
  role: z.enum(["origin", "peer", "other"]).default("other"),
  public_key: z.string().min(1),
  signature: z.string().min(1),
  signed_at: z.string().min(1),
  peer_id: z.string().optional(),
});

export const documentAttestationCaseSchema = z.object({
  id: z.string().regex(/^DA-\d{4}-\d{3}$/),
  channel: z.literal("document_attestation").default("document_attestation"),
  title: z.string().min(1),
  status: documentAttestationStatusSchema.default("draft"),
  /** Tenant-relative or absolute path — do not paste file bytes into YAML */
  pdf_path: z.string().min(1),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  byte_length: z.number().int().positive().optional(),
  algorithm: z.literal("sha256").default("sha256"),
  required_org_ids: z.array(z.string().min(1)).default([]),
  peer_id: z.string().optional(),
  signers: z.array(documentAttestationSignerSchema).default([]),
  wire_event_ids: z.array(z.string()).default([]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  notes: z.string().optional(),
});

export const documentAttestationCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  cases: z.array(documentAttestationCaseSchema).default([]),
});

/** Wire / export package — never includes PDF bytes */
export const documentAttestationPackageSchema = z.object({
  schema: z.literal("steward.document_attestation.v1"),
  case_id: z.string(),
  title: z.string(),
  content_digest: z.string().regex(/^[a-f0-9]{64}$/),
  byte_length: z.number().int().positive(),
  algorithm: z.literal("sha256"),
  required_org_ids: z.array(z.string()),
  signers: z.array(documentAttestationSignerSchema),
  origin_org_id: z.string().min(1),
  peer_id: z.string().optional(),
  exported_at: z.string().min(1),
});

export type DocumentAttestationStatus = z.output<typeof documentAttestationStatusSchema>;
export type DocumentAttestationSigner = z.output<typeof documentAttestationSignerSchema>;
export type DocumentAttestationCase = z.output<typeof documentAttestationCaseSchema>;
export type DocumentAttestationCasesFile = z.output<typeof documentAttestationCasesFileSchema>;
export type DocumentAttestationPackage = z.output<typeof documentAttestationPackageSchema>;
