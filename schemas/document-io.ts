import { z } from "zod";
import { dateString } from "./common.js";

export const inboxCategory = z.enum([
  "contracts",
  "licenses",
  "applications",
  "receipts",
  "corporate",
  "misc",
]);

export const inboxStatus = z.enum(["pending", "processing", "done", "rejected"]);

export const inboxSource = z.enum(["scan", "email", "mail", "download", "other"]);

export const inboxItemSchema = z.object({
  id: z.string().regex(/^INB-\d{3,}$/),
  filename: z.string().min(1),
  path: z.string().min(1),
  category: inboxCategory,
  status: inboxStatus.default("pending"),
  received_at: dateString,
  source: inboxSource.default("scan"),
  title: z.string().min(1),
  related_id: z.string().optional(),
  notes: z.string().optional(),
  processed_at: dateString.optional(),
  archive_path: z.string().optional(),
  output_path: z.string().optional(),
});

export const outboxCategory = z.enum([
  "corporate",
  "contracts",
  "lodging",
  "licenses",
  "submissions",
  "misc",
]);

export const outboxPurpose = z.enum(["print", "submit", "display", "archive"]);

export const outboxSource = z.enum(["cli", "manual", "inbox", "cursor"]);

export const outboxItemSchema = z.object({
  id: z.string().regex(/^OUT-\d{3,}$/),
  filename: z.string().min(1),
  path: z.string().min(1),
  category: outboxCategory,
  purpose: outboxPurpose.default("print"),
  generated_at: dateString,
  source: outboxSource.default("manual"),
  source_ref: z.string().optional(),
  title: z.string().optional(),
  related_id: z.string().optional(),
  printed_at: dateString.optional(),
  submitted_at: dateString.optional(),
  notes: z.string().optional(),
});

export const documentIoSchema = z.object({
  inbox_items: z.array(inboxItemSchema).default([]),
  outbox_items: z.array(outboxItemSchema).default([]),
  notes: z.string().optional(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;
export type OutboxItem = z.infer<typeof outboxItemSchema>;
export type DocumentIo = z.infer<typeof documentIoSchema>;
export type InboxCategory = z.infer<typeof inboxCategory>;
export type OutboxCategory = z.infer<typeof outboxCategory>;
