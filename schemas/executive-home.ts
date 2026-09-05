/**
 * Executive Home (Operator Console `/`) — composed CEO morning view.
 * ADR: docs/adr/0065-executive-home-console.md
 */
import { z } from "zod";

export const assigneeKindSchema = z.enum([
  "employee",
  "guest",
  "ai",
  "unassigned",
]);

export type AssigneeKind = z.infer<typeof assigneeKindSchema>;

export const executiveAttentionKindSchema = z.enum([
  "customer",
  "mail",
  "scheduling",
  "ceo_question",
  "approval",
  "wire",
  "handoff",
]);

export const executiveAttentionItemSchema = z.object({
  id: z.string(),
  kind: executiveAttentionKindSchema,
  title: z.string(),
  status: z.string(),
  href: z.string(),
  severity: z.enum(["p0", "p1", "p2"]).optional(),
});

export const executiveGapRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  actual_formatted: z.string(),
  target_formatted: z.string().nullable(),
  target_missing: z.boolean(),
  rag: z.enum(["green", "amber", "red", "unknown"]),
  delta_pct: z.number().nullable().optional(),
  href: z.string(),
});

export const executiveWorkItemSchema = z.object({
  id: z.string(),
  root_id: z.string(),
  title: z.string(),
  status: z.string(),
  assignee_kind: assigneeKindSchema,
  assignee_label: z.string().optional(),
  agent: z.string().optional(),
  due_date: z.string().optional(),
  href: z.string(),
});

export const executiveHomeSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  report_date: z.string(),
  company_name: z.string(),
  attention: z.array(executiveAttentionItemSchema),
  attention_count: z.number().int().nonnegative(),
  gaps: z.array(executiveGapRowSchema),
  gap_summary: z.object({
    green: z.number().int().nonnegative(),
    amber: z.number().int().nonnegative(),
    red: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    target_missing: z.number().int().nonnegative(),
  }),
  work: z.object({
    employee: z.array(executiveWorkItemSchema),
    guest: z.array(executiveWorkItemSchema),
    ai: z.array(executiveWorkItemSchema),
    unassigned: z.array(executiveWorkItemSchema),
  }),
  work_open_count: z.number().int().nonnegative(),
  finance_runway_months: z.number().nullable().optional(),
  finance_cash_balance: z.number().nullable().optional(),
  agent_summaries: z
    .array(
      z.object({
        path: z.string(),
        label: z.string(),
      }),
    )
    .default([]),
  variance: z
    .object({
      fiscal_year: z.string(),
      plan_total: z.number(),
      actual_total: z.number(),
      delta_total: z.number(),
      href: z.string(),
    })
    .optional(),
});

export type ExecutiveHome = z.infer<typeof executiveHomeSchema>;
export type ExecutiveAttentionItem = z.infer<typeof executiveAttentionItemSchema>;
export type ExecutiveGapRow = z.infer<typeof executiveGapRowSchema>;
export type ExecutiveWorkItem = z.infer<typeof executiveWorkItemSchema>;
