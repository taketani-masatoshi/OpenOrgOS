import { z } from "zod";

/** FAQ entry for inbound inquiry reply proposals (L0–L1 templates only). */
export const salesFaqEntrySchema = z.object({
  id: z.string().regex(/^FAQ-\d{3,}$/),
  title: z.string().min(1),
  /** Match when inquiry.tags intersects these */
  tags: z.array(z.string().min(1)).default([]),
  /** Case-insensitive substrings against subject + notes (L1 fields only) */
  keywords: z.array(z.string().min(1)).default([]),
  /** Suggested email subject; may include {{company}} */
  subject_template: z.string().min(1),
  /** Suggested body; may include {{company}} · {{subject}} — no L2 placeholders */
  body_template: z.string().min(1),
  next_action: z.string().min(1).optional(),
});

export const salesFaqFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  /** First-response SLA in days for new inquiries without next_action_due */
  first_response_sla_days: z.number().int().positive().default(3),
  entries: z.array(salesFaqEntrySchema).default([]),
});

export type SalesFaqEntry = z.output<typeof salesFaqEntrySchema>;
export type SalesFaqFile = z.output<typeof salesFaqFileSchema>;
