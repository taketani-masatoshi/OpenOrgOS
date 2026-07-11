import { z } from "zod";

export const senderIdentificationStatusSchema = z.enum([
  "not_needed",
  "pending_enrichment",
  "pending_ceo",
  "ceo_confirmed",
  "registered",
  "dismissed",
]);

export const webSearchHitSchema = z.object({
  title: z.string(),
  snippet: z.string(),
  url: z.string().optional(),
});

export const senderIdentificationEntrySchema = z.object({
  mail_id: z.string().min(1),
  sender_email: z.string().email(),
  sender_display_name: z.string().optional(),
  status: senderIdentificationStatusSchema.default("pending_enrichment"),
  known_contact_ref: z.string().optional(),
  known_scope: z.enum(["external", "internal", "peer"]).optional(),
  internal_domain: z.boolean().default(false),
  web_search: z
    .object({
      queried_at: z.string(),
      query: z.string(),
      hits: z.array(webSearchHitSchema).default([]),
      note: z.string().optional(),
    })
    .optional(),
  ceo_question: z
    .object({
      asked_at: z.string(),
      subject: z.string(),
      summary: z.string(),
      escalate_path: z.string().optional(),
    })
    .optional(),
  ceo_confirmed: z
    .object({
      confirmed_at: z.string(),
      confirmed_by: z.string().optional(),
      name: z.string(),
      org: z.string().optional(),
      department: z.string().optional(),
      role: z.string().optional(),
      relationship: z.string().optional(),
      notes: z.string().optional(),
      web_search_trusted: z.boolean().default(false),
    })
    .optional(),
  registered_ext_id: z.string().optional(),
  registered_stakeholder_id: z.string().optional(),
  updated_at: z.string().optional(),
});

export const senderIdentificationQueueSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(senderIdentificationEntrySchema).default([]),
});

export type SenderIdentificationEntry = z.output<typeof senderIdentificationEntrySchema>;
export type SenderIdentificationQueue = z.output<typeof senderIdentificationQueueSchema>;
export type WebSearchHit = z.output<typeof webSearchHitSchema>;
