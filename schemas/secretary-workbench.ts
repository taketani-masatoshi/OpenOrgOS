/**
 * Secretary Workbench — Operator Console daily secretary surface.
 * ADR: docs/adr/0071-executive-tasks-ssot-secretary-workbench.md
 */
import { z } from "zod";
import { taskPriority } from "./executive.js";

export const secretaryRowSeveritySchema = z.enum(["p0", "p1", "p2"]);

export const secretaryMailRowSchema = z.object({
  id: z.string(),
  subject: z.string(),
  from_label: z.string(),
  importance: taskPriority,
  urgency: z.string(),
  href: z.string(),
  severity: secretaryRowSeveritySchema,
});

export const secretaryDraftRowSchema = z.object({
  id: z.string(),
  subject: z.string(),
  to_label: z.string(),
  status: z.string(),
  created_at: z.string(),
  href: z.string(),
});

export const secretaryTaskRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: taskPriority,
  status: z.string(),
  due: z.string().nullable().optional(),
  next_action: z.string().optional(),
  property_id: z.string().optional(),
  module_id: z.string().optional(),
  asana_task_gid: z.string().optional(),
  href: z.string(),
  severity: secretaryRowSeveritySchema,
  candidate: z.boolean().default(false),
  candidate_kind: z.enum(["mail", "work_order", "approval"]).optional(),
});

export const secretaryApprovalRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  href: z.string(),
  severity: secretaryRowSeveritySchema,
});

export const secretaryCompanyStateSchema = z.object({
  cash_balance: z.number().nullable().optional(),
  runway_months: z.number().nullable().optional(),
  mail_pending: z.number().int().nonnegative(),
  mail_action_required: z.number().int().nonnegative(),
  approvals_pending: z.number().int().nonnegative(),
  tasks_open: z.number().int().nonnegative(),
  tasks_p0: z.number().int().nonnegative(),
  candidates: z.number().int().nonnegative(),
});

export const secretaryMailSetupIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  fix: z.string(),
});

export const secretaryWorkbenchSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  report_date: z.string(),
  company_name: z.string(),
  mail: z.array(secretaryMailRowSchema),
  drafts: z.array(secretaryDraftRowSchema),
  tasks: z.array(secretaryTaskRowSchema),
  approvals: z.array(secretaryApprovalRowSchema),
  company: secretaryCompanyStateSchema,
  mail_setup: z
    .object({
      ready: z.boolean(),
      issues: z.array(secretaryMailSetupIssueSchema),
      href: z.string(),
    })
    .optional(),
});

export type SecretaryWorkbench = z.infer<typeof secretaryWorkbenchSchema>;
export type SecretaryMailRow = z.infer<typeof secretaryMailRowSchema>;
export type SecretaryDraftRow = z.infer<typeof secretaryDraftRowSchema>;
export type SecretaryTaskRow = z.infer<typeof secretaryTaskRowSchema>;
export type SecretaryApprovalRow = z.infer<typeof secretaryApprovalRowSchema>;
