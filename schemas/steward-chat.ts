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
  witness_pending: z.array(todayWitnessPendingSchema).default([]),
  witness_pending_count: z.number().int().nonnegative().default(0),
  inbox_pending: z.array(todayInboxItemSchema),
  escalate_pending_count: z.number().int().nonnegative(),
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
