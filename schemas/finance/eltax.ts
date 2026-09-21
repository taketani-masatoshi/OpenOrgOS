import { z } from "zod";

export const eltaxTaxTypeSchema = z.enum(["corporate_local_tax", "fixed_asset_tax", "payroll_report"]);
export const eltaxOfficialPackageSchema = z.object({
  schema: z.literal("orgos.jp.eltax-official-package.v1"),
  package_id: z.string().min(1),
  tax_type: eltaxTaxTypeSchema,
  municipality_code: z.string().regex(/^\d{5,6}$/),
  procedure_id: z.string().min(1),
  payload_path: z.string().min(1),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  spec_id: z.string().min(1),
  certified_at: z.string().datetime(),
});

export const eltaxSubmissionStatusSchema = z.enum([
  "prepared", "approved", "signed", "sending", "received", "accepted", "rejected", "cancelled",
]);
export const eltaxSubmissionRecordSchema = z.object({
  schema: z.literal("orgos.jp.eltax-submission.v1"),
  submission_id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  idempotency_key: z.string().min(1),
  status: eltaxSubmissionStatusSchema,
  package: eltaxOfficialPackageSchema,
  approval: z.object({ operator_id: z.string().min(1), approved_at: z.string().datetime(), payload_sha256: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
  signature: z.object({ algorithm: z.string().min(1), certificate_fingerprint_sha256: z.string().regex(/^[a-f0-9]{64}$/), signature_path: z.string().min(1), signature_sha256: z.string().regex(/^[a-f0-9]{64}$/), signed_at: z.string().datetime() }).optional(),
  request_id: z.string().min(1).optional(),
  attempts: z.array(z.object({ attempted_at: z.string().datetime(), request_id: z.string().min(1), outcome: z.enum(["started", "received", "failed"]) })).default([]),
  local_receipt_number: z.string().min(1).optional(),
  retention_until: z.string().date(),
  legal_hold: z.boolean().default(false),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type EltaxOfficialPackage = z.output<typeof eltaxOfficialPackageSchema>;
export type EltaxSubmissionRecord = z.output<typeof eltaxSubmissionRecordSchema>;
export type EltaxSubmissionStatus = z.output<typeof eltaxSubmissionStatusSchema>;
