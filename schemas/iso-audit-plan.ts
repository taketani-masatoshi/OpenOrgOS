import { z } from "zod";
import { dateString } from "./common.js";

/**
 * ISO 19011 internal audit as a record, not as a score.
 *
 * `orgos iso audit run` checks whether declared evidence exists and meets its
 * specification. That is a precondition, not an audit: an audit is a person
 * judging, against stated criteria and on sampled evidence, whether each
 * requirement is met. This schema holds that judgement — who made it, on what
 * they looked at, and what they concluded — so it can be reviewed and signed.
 */

export const isoAuditPlanId = z.string().regex(/^IAP-\d{3}$/);

export const isoAuditVerdict = z.enum([
  "conform",
  "nonconform_minor",
  "nonconform_major",
  "observation",
  "not_applicable",
]);

export const isoAuditPlanStatus = z.enum(["draft", "concluded", "signed"]);

export const isoAuditFindingSchema = z.object({
  requirement_id: z.string().min(1),
  verdict: isoAuditVerdict,
  /** Tenant-relative paths the auditor actually looked at. */
  evidence: z.array(z.string().min(1)).default([]),
  /** What was sampled and how much — an audit without sampling is an assertion. */
  sample: z.string().optional(),
  /** The auditor's own words. Never generated. */
  note: z.string().optional(),
  recorded_at: z.string().min(1),
  recorded_by: z.string().min(1),
});

export const isoAuditConclusionSchema = z.object({
  concluded_at: z.string().min(1),
  concluded_by: z.string().min(1),
  summary: z.string().min(1),
  nonconformities: z.number().int().nonnegative(),
  major: z.number().int().nonnegative(),
});

export const isoAuditSignoffSchema = z.object({
  approval_id: z.string().min(1),
  signed_at: z.string().min(1),
  signed_by_operator_id: z.string().min(1),
  /** Digest of the findings at signing time; edits after signing break verification. */
  subject_digest: z.string().min(1),
});

export const isoAuditPlanSchema = z.object({
  plan_id: isoAuditPlanId,
  standard: z.string().min(1),
  status: isoAuditPlanStatus.default("draft"),
  /** ISO 19011 / financial / J-SOX. Default iso for existing plans. */
  framework: z.enum(["iso", "financial", "jsox"]).default("iso"),
  auditor_operator_id: z.string().min(1),
  auditor_name: z.string().optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}$/),
  /** Controls in scope. Empty means every in-scope control of the standard. */
  scope_controls: z.array(z.string().min(1)).default([]),
  /** Documents the audit is conducted against (standard, policies, regulations). */
  criteria: z.array(z.string().min(1)).default([]),
  sampling: z.string().optional(),
  /** Audit run id attached as input evidence at creation. */
  precheck_run_id: z.string().optional(),
  created_at: z.string().min(1),
  created_by: z.string().min(1),
  planned_on: dateString.optional(),
  findings: z.array(isoAuditFindingSchema).default([]),
  conclusion: isoAuditConclusionSchema.optional(),
  signoff: isoAuditSignoffSchema.optional(),
});

export const isoAuditPlanRegistrySchema = z.object({
  as_of: z.string().optional(),
  plans: z.array(isoAuditPlanSchema).default([]),
});

export type IsoAuditVerdict = z.output<typeof isoAuditVerdict>;
export type IsoAuditPlanStatus = z.output<typeof isoAuditPlanStatus>;
export type IsoAuditFinding = z.output<typeof isoAuditFindingSchema>;
export type IsoAuditConclusion = z.output<typeof isoAuditConclusionSchema>;
export type IsoAuditSignoff = z.output<typeof isoAuditSignoffSchema>;
export type IsoAuditPlan = z.output<typeof isoAuditPlanSchema>;
export type IsoAuditPlanRegistry = z.output<typeof isoAuditPlanRegistrySchema>;
