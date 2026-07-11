import { z } from "zod";

export const todayDecisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string().optional(),
  due_date: z.string().optional(),
  importance: z.string().optional(),
});

export const todayApprovalSchema = z.object({
  id: z.string(),
  scope: z.enum(["internal", "wire"]),
  subject: z.string(),
  status: z.string(),
  proposed_at: z.string(),
});

export const todayInboxItemSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const todayMailIntakeItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.string(),
  importance: z.string(),
  urgency: z.string(),
  handoff_status: z.string(),
});

export const todayCeoInlineQuestionSchema = z.object({
  id: z.string(),
  mail_id: z.string(),
  subject: z.string(),
  context_preview: z.string(),
  field_count: z.number().int().nonnegative(),
});

export const todayAgentRelayItemSchema = z.object({
  id: z.string(),
  field_agent: z.string(),
  subject: z.string(),
  type: z.string().optional(),
  has_report: z.boolean().optional(),
});

export const todayKpiSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const todayWirePendingSchema = z.object({
  id: z.string(),
  subject: z.string(),
  counterparty: z.string(),
  preview: z.string(),
  status_label: z.string(),
  can_approve: z.boolean().optional(),
  approval_id: z.string().optional(),
});

export const todayWitnessPendingSchema = z.object({
  id: z.string(),
  subject: z.string(),
  preview: z.string(),
  event_id: z.string().optional(),
  wire_event_id: z.string().optional(),
  can_witness: z.boolean().optional(),
});

export const todayWireDeliverySchema = z.object({
  peer_id: z.string(),
  event_id: z.string(),
  attempts: z.number().int().nonnegative(),
  last_error: z.string().optional(),
  created_at: z.string(),
});

export const todayEmailWirePendingSchema = z.object({
  peer_id: z.string(),
  event_id: z.string(),
  attempts: z.number().int().nonnegative(),
  last_error: z.string().optional(),
  created_at: z.string(),
});

export const todayContextSchema = z.object({
  tenant: z.string(),
  report_date: z.string(),
  company_name: z.string(),
  decisions: z.array(todayDecisionSchema).max(3),
  approvals: z.array(todayApprovalSchema),
  wire_pending_count: z.number().int().nonnegative(),
  wire_pending: z.array(todayWirePendingSchema).default([]),
  wire_delivery_pending_count: z.number().int().nonnegative().default(0),
  wire_delivery: z.array(todayWireDeliverySchema).default([]),
  email_wire_pending_count: z.number().int().nonnegative().default(0),
  email_wire_pending: z.array(todayEmailWirePendingSchema).default([]),
  witness_pending: z.array(todayWitnessPendingSchema).default([]),
  witness_pending_count: z.number().int().nonnegative().default(0),
  inbox_pending: z.array(todayInboxItemSchema),
  mail_intake_pending_count: z.number().int().nonnegative().default(0),
  mail_intake_action_required_count: z.number().int().nonnegative().default(0),
  mail_intake_pending: z.array(todayMailIntakeItemSchema).default([]),
  sender_identification_pending_count: z.number().int().nonnegative().default(0),
  sender_identification_pending: z
    .array(
      z.object({
        mail_id: z.string(),
        sender_email: z.string(),
        sender_display_name: z.string().optional(),
        subject: z.string().optional(),
      })
    )
    .default([]),
  ceo_inline_questions_pending_count: z.number().int().nonnegative().default(0),
  ceo_inline_questions_pending: z.array(todayCeoInlineQuestionSchema).default([]),
  escalate_pending_count: z.number().int().nonnegative(),
  agent_coo_relay_count: z.number().int().nonnegative().default(0),
  agent_coo_relay: z.array(todayAgentRelayItemSchema).default([]),
  agent_steward_inbox_count: z.number().int().nonnegative().default(0),
  agent_steward_inbox: z.array(todayAgentRelayItemSchema).default([]),
  kpis: z.array(todayKpiSchema).max(6),
  executive_summary_path: z.string().optional(),
  dashboard_path: z.string().optional(),
});

export type TodayContext = z.output<typeof todayContextSchema>;

export const chatMessageRequestSchema = z.object({
  message: z.string().min(1),
  refresh: z.boolean().optional(),
});

export const notificationsRegistrySchema = z.object({
  version: z.string(),
  channels: z
    .object({
      webhook: z
        .object({
          url: z.string().url().optional(),
          secret: z.string().optional(),
          events: z.array(z.string()).default([]),
        })
        .optional(),
      openwebui: z
        .object({
          ingest_url: z.string().url().optional(),
          events: z.array(z.string()).default([]),
        })
        .optional(),
    })
    .optional(),
});

export type NotificationsRegistry = z.output<typeof notificationsRegistrySchema>;
