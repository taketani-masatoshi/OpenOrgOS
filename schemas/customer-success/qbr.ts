import { z } from "zod";
import { dateString } from "../common.js";

export const customerQbrSchema = z.object({
  id: z.string().regex(/^QBR-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  period: z.string().min(1),
  scheduled_on: dateString.optional(),
  held_on: dateString.optional(),
  /** L1 summary lines only — no verbatim meeting notes */
  outcomes: z.array(z.string().min(1)).optional(),
  next_due: dateString.optional(),
});

export type CustomerQbr = z.output<typeof customerQbrSchema>;

export const customerQbrFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  qbrs: z.array(customerQbrSchema),
});

export type CustomerQbrFile = z.output<typeof customerQbrFileSchema>;
