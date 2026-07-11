import { z } from "zod";

export const ceoInlineFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["yes_no", "yes_no_unknown", "text", "time", "choice"]).default("text"),
  choices: z.array(z.string()).optional(),
});

export const ceoInlineQuestionSchema = z.object({
  id: z.string(),
  mail_id: z.string(),
  /** 日程調整案件（CEO 確定確認） */
  scheduling_case_id: z.string().optional(),
  subject: z.string(),
  context_l1: z.string().max(1000),
  fields: z.array(ceoInlineFieldSchema).default([]),
  status: z.enum(["pending", "answered", "dismissed"]).default("pending"),
  asked_at: z.string(),
  answered_at: z.string().optional(),
  answers: z.record(z.string()).optional(),
  answered_by: z.string().optional(),
});

export const ceoInlineQueueSchema = z.object({
  version: z.literal(1).default(1),
  questions: z.array(ceoInlineQuestionSchema).default([]),
});

export type CeoInlineQuestion = z.output<typeof ceoInlineQuestionSchema>;
export type CeoInlineQueue = z.output<typeof ceoInlineQueueSchema>;
