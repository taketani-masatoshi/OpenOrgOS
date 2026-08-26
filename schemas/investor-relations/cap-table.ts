import { z } from "zod";
import { dateString } from "../common.js";

export const capTableSecurityTypeSchema = z.enum([
  "common",
  "preferred",
  "stock_option",
  "warrant",
  "convertible",
  "other",
]);

export const capTableLineSchema = z.object({
  /** stakeholder_id or a non-personal aggregate label — no L2 personal names. */
  holder_ref: z.string().min(1),
  security_type: capTableSecurityTypeSchema,
  shares: z.number().nonnegative().optional(),
  fully_diluted_pct: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const capTableFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  company_label: z.string().min(1).optional(),
  lines: z.array(capTableLineSchema).default([]),
  notes: z.string().optional(),
});

export type CapTableLine = z.output<typeof capTableLineSchema>;
export type CapTableFile = z.output<typeof capTableFileSchema>;
