import { z } from "zod";

/**
 * Typed inter-module / inter-agent messages (ADR 0040).
 * Spec: docs/org-os/module-messaging.md
 * Human Markdown inquiry protocol remains in folder_access_policy §4.
 */

export const moduleMessageConfidentialitySchema = z.enum(["L0", "L1"]);

export const moduleMessageStatusSchema = z.enum([
  "pending",
  "delivered",
  "answered",
  "rejected",
  "expired",
]);

export const moduleMessageIntentSchema = z.enum([
  "inquire",
  "inform",
  "handoff",
  "request_summary",
  "request_fact",
  "escalate",
  "reply",
]);

export const moduleMessagePartySchema = z.object({
  /** Catalog module id or core agent id */
  id: z.string().min(1),
  kind: z.enum(["module", "agent", "integration"]),
});

export const moduleMessageRefSchema = z.object({
  path: z.string().min(1).optional(),
  work_order_id: z.string().min(1).optional(),
  approval_id: z.string().min(1).optional(),
  receipt_id: z.string().min(1).optional(),
  note: z.string().optional(),
});

/**
 * Machine-path message. payload_summary must stay L0/L1 — never L2 values.
 */
export const moduleMessageSchema = z.object({
  message_id: z.string().regex(/^MSG-\d{8}-[a-z0-9-]{4,}$/),
  schema: z.literal("orgos.module.message.v1").default("orgos.module.message.v1"),
  from: moduleMessagePartySchema,
  to: moduleMessagePartySchema,
  intent: moduleMessageIntentSchema,
  confidentiality: moduleMessageConfidentialitySchema.default("L1"),
  status: moduleMessageStatusSchema.default("pending"),
  refs: z.array(moduleMessageRefSchema).default([]),
  reply_to: z.string().min(1).optional(),
  /** Short L0/L1 summary only — no account numbers, personal addresses, secrets */
  payload_summary: z.string().min(1).max(4000),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  answered_at: z.string().datetime().optional(),
  /** Relative path under scratch for large attachments (optional) */
  attachment_workspace_relpath: z.string().optional(),
});

export const moduleMessageRegistrySchema = z.object({
  version: z.literal(1),
  messages: z.array(moduleMessageSchema).default([]),
});

export type ModuleMessage = z.output<typeof moduleMessageSchema>;
export type ModuleMessageRegistry = z.output<typeof moduleMessageRegistrySchema>;
