import { z } from "zod";
import { monthString } from "../common.js";

export const periodLockStatusSchema = z.enum(["locked", "unlocked"]);

export const periodLockEvidenceSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("sha256"),
  journal_entries_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bank_reconciliation_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  trial_balance_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  gate_results_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  operator_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  can_lock: z.literal(true),
  gate_results: z.array(
    z.object({
      id: z.string().min(1),
      pass: z.boolean(),
      level: z.enum(["error", "warning", "skip"]),
      detail: z.string().optional(),
    }),
  ),
});

export const periodLockEntrySchema = z.object({
  month: monthString,
  status: periodLockStatusSchema.default("locked"),
  at: z.string().min(1),
  by: z.string().min(1),
  reason: z.string().optional(),
  evidence: periodLockEvidenceSchema.optional(),
});

export const periodLocksFileSchema = z.object({
  version: z.literal(1),
  locks: z.array(periodLockEntrySchema).default([]),
});

export type PeriodLockStatus = z.output<typeof periodLockStatusSchema>;
export type PeriodLocksFile = z.output<typeof periodLocksFileSchema>;
export type PeriodLockEntry = z.output<typeof periodLockEntrySchema>;
export type PeriodLockEvidence = z.output<typeof periodLockEvidenceSchema>;
