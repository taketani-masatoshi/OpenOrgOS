import { z } from "zod";
import { agentId } from "./classification.js";
import { CONTROL_GAP_TYPES } from "./control-framework.js";

export const isoAuditVerdict = z.enum([
  "conform",
  "observation",
  "nonconformity",
  "map_missing",
]);

export const isoAuditOverall = z.enum([
  "conform",
  "conditionally_conform",
  "nonconform",
]);

/** Mirrors the control's declared `priority` — see `controlPriority`. */
export const isoAuditPriority = z.enum(["P1", "P2", "P3"]);

/**
 * A gap the verdict did not come from. One control can owe several things at
 * once — the form is missing *and* the register it replaces is malformed — and
 * an operator who only sees the deciding gap fixes half the problem.
 */
export const isoAuditGapNoteSchema = z.object({
  gap_type: z.enum(CONTROL_GAP_TYPES),
  detail: z.string().min(1),
});

export const isoInternalAuditFindingSchema = z.object({
  priority: isoAuditPriority.default("P3"),
  control_id: z.string(),
  standard: z.string().min(1),
  clause: z.string().min(1),
  title: z.string().min(1),
  verdict: isoAuditVerdict,
  gap_type: z.enum(CONTROL_GAP_TYPES).optional(),
  detail: z.string().min(1),
  /** Remaining gaps on the same control, in the order they were computed. */
  other_gaps: z.array(isoAuditGapNoteSchema).default([]),
  primary_agent: agentId,
  improvement: z.string().min(1),
});

export const isoInternalAuditSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  conform: z.number().int().nonnegative(),
  observation: z.number().int().nonnegative(),
  nonconformity: z.number().int().nonnegative(),
  map_missing: z.number().int().nonnegative(),
});

export const isoInternalAuditRunSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  tenant: z.string().min(1),
  actor: z.literal("internal_audit"),
  standards: z.array(z.string().min(1)),
  overall: isoAuditOverall,
  summary: isoInternalAuditSummarySchema,
  findings: z.array(isoInternalAuditFindingSchema),
});

export type IsoAuditPriority = z.output<typeof isoAuditPriority>;
export type IsoAuditVerdict = z.output<typeof isoAuditVerdict>;
export type IsoAuditOverall = z.output<typeof isoAuditOverall>;
export type IsoAuditGapNote = z.output<typeof isoAuditGapNoteSchema>;
export type IsoInternalAuditFinding = z.output<typeof isoInternalAuditFindingSchema>;
export type IsoInternalAuditSummary = z.output<typeof isoInternalAuditSummarySchema>;
export type IsoInternalAuditRun = z.output<typeof isoInternalAuditRunSchema>;
