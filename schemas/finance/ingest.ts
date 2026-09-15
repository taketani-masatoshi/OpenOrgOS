/**
 * Finance ingest staging + classification rules (orgos ingest).
 * Drop files under docs/io/inbox/{bank,card,...}; post requires --write.
 */
import { z } from "zod";
import { dateString } from "../common.js";
import { taxCategorySchema } from "./journal-entry.js";

export const ingestSourceKindSchema = z.enum([
  "bank",
  "card",
  "transit",
  "wallet",
  "marketplace",
  "sales",
  "receipts",
  "contracts",
]);

export const ingestRowStatusSchema = z.enum([
  "parsed",
  "classified",
  "posted",
  "needs_review",
  "skipped",
]);

export const ingestDirectionSchema = z.enum(["inflow", "outflow"]);

export const ingestStagingRowSchema = z.object({
  row_id: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  batch_id: z.string().min(1),
  source_kind: ingestSourceKindSchema,
  occurred_on: dateString,
  direction: ingestDirectionSchema,
  amount_yen: z.number().int().positive(),
  payee: z.string().default(""),
  description: z.string().default(""),
  category_hint: z.string().optional(),
  account_code: z.string().regex(/^\d{4}$/).optional(),
  cash_account_code: z.string().regex(/^\d{4}$/).optional(),
  tax_category: taxCategorySchema.optional(),
  business_pct: z.number().min(0).max(100).optional(),
  status: ingestRowStatusSchema.default("parsed"),
  evidence_refs: z.array(z.string().min(1)).min(1),
  entry_id: z.string().regex(/^JE-[A-Z0-9-]+$/).optional(),
  review_notes: z.array(z.string()).default([]),
  raw: z.record(z.string(), z.string()).optional(),
});

export const ingestStagingBatchSchema = z.object({
  batch_id: z.string().min(1),
  source_kind: ingestSourceKindSchema,
  file_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  imported_at: z.string().min(1),
  logical_path: z.string().min(1),
  row_ids: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export const ingestStagingFileSchema = z.object({
  version: z.literal(1).default(1),
  batches: z.array(ingestStagingBatchSchema).default([]),
  rows: z.array(ingestStagingRowSchema).default([]),
});

export const ingestRuleMatchSchema = z.object({
  /** Case-insensitive substring match against payee + description + category_hint */
  contains: z.string().min(1).optional(),
  source_kind: ingestSourceKindSchema.optional(),
  direction: ingestDirectionSchema.optional(),
});

export const ingestRuleSchema = z.object({
  id: z.string().min(1),
  match: ingestRuleMatchSchema,
  account_code: z.string().regex(/^\d{4}$/),
  cash_account_code: z.string().regex(/^\d{4}$/).optional(),
  tax_category: taxCategorySchema.optional(),
  business_pct: z.number().min(0).max(100).optional(),
  priority: z.number().int().default(100),
});

export const ingestRulesFileSchema = z.object({
  version: z.literal(1).default(1),
  default_cash_account_code: z.string().regex(/^\d{4}$/).default("1120"),
  default_revenue_account_code: z.string().regex(/^\d{4}$/).default("4100"),
  /** Outflow amount at or above this → skip post, suggest expense-intake */
  asset_intake_threshold_yen: z.number().int().positive().default(100_000),
  rules: z.array(ingestRuleSchema).default([]),
});

export type IngestSourceKind = z.output<typeof ingestSourceKindSchema>;
export type IngestDirection = z.output<typeof ingestDirectionSchema>;
export type IngestStagingRow = z.output<typeof ingestStagingRowSchema>;
export type IngestStagingBatch = z.output<typeof ingestStagingBatchSchema>;
export type IngestStagingFile = z.output<typeof ingestStagingFileSchema>;
export type IngestRulesFile = z.output<typeof ingestRulesFileSchema>;
export type IngestRule = z.output<typeof ingestRuleSchema>;
