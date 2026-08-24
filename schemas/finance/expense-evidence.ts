import { z } from "zod";

export const expenseEvidenceManifestEntrySchema = z.object({
  evidence_id: z.string().regex(/^EE-ECL-\d{8}-\d{3}$/),
  claim_id: z.string().regex(/^ECL-\d{8}-\d{3}$/),
  receipt_id: z.string().min(1),
  t_number: z.string().regex(/^T\d{13}$/),
  transaction_date: z.string().date(),
  archive_path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  archived_at: z.string().datetime(),
  retention_until: z.string().date(),
});

export const expenseEvidenceManifestSchema = z.object({
  version: z.literal(1).default(1),
  evidence: z.array(expenseEvidenceManifestEntrySchema).default([]),
});

export type ExpenseEvidenceManifestEntry = z.output<
  typeof expenseEvidenceManifestEntrySchema
>;
export type ExpenseEvidenceManifest = z.output<
  typeof expenseEvidenceManifestSchema
>;
