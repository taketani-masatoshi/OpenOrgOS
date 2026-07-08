import { z } from "zod";

export const reconcileAlertRecordSchema = z.object({
  at: z.string().min(1),
  severity: z.enum(["error", "warning", "info", "critical"]),
  code: z.string().min(1),
  message: z.string().min(1),
  event_id: z.string().optional(),
  peer_id: z.string().optional(),
  escalated: z.boolean().default(false),
  occurrence_count: z.number().int().positive().default(1),
});

export const reconcileAlertsStoreSchema = z.object({
  as_of: z.string().optional(),
  alerts: z.array(reconcileAlertRecordSchema).default([]),
});

export type ReconcileAlertRecord = z.output<typeof reconcileAlertRecordSchema>;
export type ReconcileAlertsStore = z.output<typeof reconcileAlertsStoreSchema>;
