import { z } from "zod";

export const relayCycleMetricsSchema = z.object({
  at: z.string().min(1),
  wire_flushed: z.number().int().nonnegative(),
  witness_flushed: z.number().int().nonnegative(),
  wire_pending: z.number().int().nonnegative(),
  witness_pending: z.number().int().nonnegative(),
  sla_failures: z.number().int().nonnegative().default(0),
  reconcile_alerts: z.number().int().nonnegative().default(0),
  relay_pulled: z.number().int().nonnegative().default(0),
});

export const relayStateSchema = z.object({
  last_run_at: z.string().optional(),
  cycles: z.number().int().nonnegative().default(0),
  last_metrics: relayCycleMetricsSchema.optional(),
  history: z.array(relayCycleMetricsSchema).max(48).default([]),
});

export type RelayCycleMetrics = z.output<typeof relayCycleMetricsSchema>;
export type RelayState = z.output<typeof relayStateSchema>;
