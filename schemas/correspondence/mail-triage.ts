import { z } from "zod";

export const mailImportanceSchema = z.enum(["p0", "p1", "p2", "p3"]);
export const mailUrgencySchema = z.enum(["immediate", "today", "week", "none"]);
export const mailDispositionSchema = z.enum(["ham", "spam", "suspicious", "unknown"]);
export const mailRoutingSchema = z.enum(["secretary", "archive", "ignore"]);
export const mailHandoffStatusSchema = z.enum(["pending", "handed_off", "dismissed"]);

export const senderIdentificationStatusSchema = z.enum([
  "not_needed",
  "pending_enrichment",
  "pending_ceo",
  "ceo_confirmed",
  "registered",
]);

export const mailTriageEntrySchema = z.object({
  id: z.string().min(1),
  source_message_id: z.string().optional(),
  received_at: z.string(),
  from: z.string(),
  subject: z.string(),
  importance: mailImportanceSchema.default("p2"),
  urgency: mailUrgencySchema.default("none"),
  disposition: mailDispositionSchema.default("unknown"),
  routing: mailRoutingSchema.default("secretary"),
  handoff_status: mailHandoffStatusSchema.default("pending"),
  eml_ref: z.string(),
  rule_hits: z.array(z.string()).default([]),
  triaged_at: z.string().optional(),
  notified_at: z.string().optional(),
  handoff_ref: z.string().optional(),
  sender_email: z.string().optional(),
  sender_known: z.boolean().default(false),
  sender_contact_ref: z.string().optional(),
  sender_scope: z.enum(["external", "internal", "peer"]).optional(),
  identification_status: senderIdentificationStatusSchema.optional(),
  /** 日程調整案件 ID（Secretary schedule_coordination） */
  scheduling_case_id: z.string().optional(),
  /** 返信パース済み */
  schedule_reply_parsed: z.boolean().optional(),
  /** 関連メールスレッド ID */
  mail_thread_ids: z.array(z.string()).default([]),
});

export const mailTriageQueueSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(mailTriageEntrySchema).default([]),
});

export type MailTriageEntry = z.output<typeof mailTriageEntrySchema>;
export type MailTriageQueue = z.output<typeof mailTriageQueueSchema>;
export type MailImportance = z.output<typeof mailImportanceSchema>;
export type MailUrgency = z.output<typeof mailUrgencySchema>;
export type MailDisposition = z.output<typeof mailDispositionSchema>;
export type MailRouting = z.output<typeof mailRoutingSchema>;
