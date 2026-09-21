import { z } from "zod";

/** Doctrine gates that stay false / human for propose-only surfaces. */
export const proposeHumanGateSchema = z.object({
  apply: z.literal("human"),
  sent: z.literal(false).optional(),
  executed: z.literal(false).optional(),
  posted: z.literal(false).optional(),
  looping: z.literal(false).optional(),
});

export type ProposeHumanGate = z.output<typeof proposeHumanGateSchema>;

/**
 * Common envelope for propose-only reports.
 * Depth L2 reports should set inputs_ref when they read tenant SoT.
 */
export const proposeReportEnvelopeSchema = z.object({
  kind: z.string().min(1),
  version: z.literal(1),
  generated_at: z.string().min(1),
  inputs_ref: z.array(z.string().min(1)).default([]),
  human_gate: proposeHumanGateSchema,
  depth: z.enum(["L0", "L1", "L2"]),
  payload: z.record(z.string(), z.unknown()),
});

export type ProposeReportEnvelope = z.output<typeof proposeReportEnvelopeSchema>;

export const proposeReportKindSchema = z.enum([
  "audit-pack",
  "sod-report",
  "bottleneck-report",
  "followup-report",
  "field-analytics-report",
  "lost-deal-followup-report",
  "bant-report",
  "cashflow-report",
  "project-pl-report",
  "payroll-transfer-report",
  "portal-grant",
  "tracking-status",
  "expense-intake-report",
  "invoice-journal-report",
  "quote-draft-report",
  "stock-reorder-report",
  "dispatch-report",
  "replan-report",
  "aia-cycle-report",
  "job-completion-report",
  "field-intake-report",
  "field-interface-report",
  "hr-lifecycle-report",
  "trace-bridge-report",
  "tower-classify-report",
  "jsox-status-report",
  "jsox-evaluate-report",
]);

export type ProposeReportKind = z.output<typeof proposeReportKindSchema>;
