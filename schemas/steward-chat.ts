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

export const todaySchedulingCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  next_action: z.string(),
  headline: z.string(),
  detail: z.string(),
  approval_id: z.string().optional(),
  ceo_question_id: z.string().optional(),
  action_path: z.string().optional(),
  preview_path: z.string().optional(),
  action_kind: z.enum(["approve", "answer", "retry"]).optional(),
  pending_participants: z.number().int().nonnegative(),
});

export const todayAgentRosterItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  tier: z.string(),
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
  scheduling_cases_active_count: z.number().int().nonnegative().default(0),
  scheduling_cases_action_count: z.number().int().nonnegative().default(0),
  scheduling_cases_pending: z.array(todaySchedulingCaseSchema).default([]),
  escalate_pending_count: z.number().int().nonnegative(),
  agent_coo_relay_count: z.number().int().nonnegative().default(0),
  agent_coo_relay: z.array(todayAgentRelayItemSchema).default([]),
  agent_steward_inbox_count: z.number().int().nonnegative().default(0),
  agent_steward_inbox: z.array(todayAgentRelayItemSchema).default([]),
  kpis: z.array(todayKpiSchema).max(6),
  executive_summary_path: z.string().optional(),
  dashboard_path: z.string().optional(),
  agent_summary_paths: z.array(z.string()).default([]),
  cashflow_schedule_path: z.string().optional(),
  cashflow_shortfall_date: z.string().nullable().optional(),
  cashflow_runway_days: z.number().nullable().optional(),
  cashflow_required_funding_amount: z.number().nonnegative().nullable().optional(),
  cashflow_required_funding_by_date: z.string().nullable().optional(),
  agent_roster_configured: z.boolean().default(false),
  agent_roster_operational_count: z.number().int().nonnegative().default(0),
  agent_roster_developer_count: z.number().int().nonnegative().default(0),
  agent_roster_operational: z.array(todayAgentRosterItemSchema).default([]),
  agent_roster_developer: z.array(todayAgentRosterItemSchema).default([]),
});

export type TodayContext = z.output<typeof todayContextSchema>;

export const chatMessageRequestSchema = z.object({
  message: z.string().min(1),
  refresh: z.boolean().optional(),
});

export const chatCashflowStructuredSchema = z.object({
  cashflow_path: z
    .string()
    .refine((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(path)),
  cashflow_shortfall_date: z.string().nullable(),
  cashflow_runway_days: z.number().nonnegative().nullable(),
  cashflow_required_funding_amount: z.number().nonnegative().nullable(),
  cashflow_required_funding_by_date: z.string().nullable(),
  cashflow_wrote: z.boolean(),
});

export type ChatCashflowStructured = z.output<typeof chatCashflowStructuredSchema>;

export const chatApprovalRequestSchema = z.object({
  flush: z.boolean().optional(),
  /** Required and must be true for scheduling correspondence. */
  reviewed: z.boolean().optional(),
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
