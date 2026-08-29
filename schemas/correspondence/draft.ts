import { z } from "zod";

export const correspondenceChannelSchema = z.enum(["email", "slack"]);

export const correspondenceDraftStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "rejected",
]);

export const correspondenceDraftSchema = z.object({
  draft_id: z.string().regex(/^DRAFT-\d{8}-\d{3}(?:-[a-z0-9-]+)?$/),
  channel: correspondenceChannelSchema,
  status: correspondenceDraftStatusSchema,
  created_at: z.string().min(1),
  created_by: z.string().min(1),
  approval_id: z.string().optional(),
  /** email */
  to: z.string().optional(),
  cc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  /** slack */
  slack_channel: z.string().optional(),
  /** set on send */
  sent_at: z.string().optional(),
  sent_by: z.string().optional(),
  company_event_id: z.string().optional(),
  contact_ref: z.string().optional(),
  /** Sales deal or inquiry ref for follow-up tracking */
  deal_id: z.string().regex(/^DEAL-\d{4}-\d{3}$/).optional(),
  inquiry_id: z.string().regex(/^INQ-\d{4}-\d{3}$/).optional(),
  /** Tenant-logical docs paths only. Resolved and attached by the mail transport. */
  attachment_refs: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});

export type CorrespondenceChannel = z.output<
  typeof correspondenceChannelSchema
>;
export type CorrespondenceDraftStatus = z.output<
  typeof correspondenceDraftStatusSchema
>;
export type CorrespondenceDraft = z.output<typeof correspondenceDraftSchema>;
