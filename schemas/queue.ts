import { z } from "zod";

export const queueEventTypeSchema = z.enum([
  "work_order_created",
  "work_order_complete",
  "dispatch_requested",
  "dispatch_complete",
  "webhook_received",
  "merge_complete",
  "pr_requested",
  "pr_created",
  "secretary_consult",
  "pipeline_daily_complete",
  "agent_mission_created",
  "agent_report_submitted",
  "agent_relay_coo",
  "agent_relay_steward",
]);

export const queueEventStatusSchema = z.enum(["pending", "processing", "done", "failed"]);

export const queueEventSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  tenant: z.string(),
  type: queueEventTypeSchema,
  ref: z.string(),
  status: queueEventStatusSchema.default("pending"),
  payload: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  processed_at: z.string().optional(),
});

export type QueueEventType = z.output<typeof queueEventTypeSchema>;
export type QueueEventStatus = z.output<typeof queueEventStatusSchema>;
export type QueueEvent = z.output<typeof queueEventSchema>;

export const dispatchTaskSchema = z.object({
  work_order_id: z.string(),
  agent: z.string(),
  prompt_path: z.string(),
  prompt_relative: z.string().optional(),
  mode: z.enum(["cursor_sdk", "cursor_cloud", "manifest"]).default("manifest"),
});

export const dispatchManifestSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  tenant: z.string(),
  parent_id: z.string().optional(),
  parallel: z.number().int().default(3),
  tasks: z.array(dispatchTaskSchema),
  cursor_sdk_available: z.boolean().default(false),
});

export type DispatchManifest = z.output<typeof dispatchManifestSchema>;
export type DispatchTask = z.output<typeof dispatchTaskSchema>;

export const workOrderResultSchema = z.object({
  work_order_id: z.string(),
  agent: z.string(),
  completed_at: z.string(),
  summary: z.string(),
  notes: z.string().optional(),
  artifacts: z.array(z.string()).default([]),
});

export type WorkOrderResult = z.output<typeof workOrderResultSchema>;
