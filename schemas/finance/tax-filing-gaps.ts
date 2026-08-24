import { z } from "zod";
import { dateString } from "../common.js";

export const taxGapSeveritySchema = z.enum(["blocking", "warning", "info"]);

export const taxGapHandoffSchema = z.enum([
  "finance",
  "accounting",
  "human",
  "tax_advisor",
]);

/** Structured gap row — SSOT overlay for tax filing prep. */
export const taxFilingGapItemSchema = z.object({
  id: z.string().min(1),
  severity: taxGapSeveritySchema,
  area: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
  handoff: taxGapHandoffSchema.optional(),
  /** open = active · resolved = suppress engine gap with same id · deferred = keep as info */
  status: z.enum(["open", "resolved", "deferred"]).default("open"),
  notes: z.string().optional(),
});

export const taxFilingGapsSchema = z.object({
  as_of: dateString.optional(),
  fiscal_year: z.string().optional(),
  /** operator = human-maintained · engine = last export snapshot */
  source: z.enum(["operator", "engine"]).default("operator"),
  gaps: z.array(taxFilingGapItemSchema).default([]),
  notes: z.string().optional(),
});

export type TaxFilingGapItem = z.output<typeof taxFilingGapItemSchema>;
export type TaxFilingGaps = z.output<typeof taxFilingGapsSchema>;
