import { z } from "zod";
import { dateString } from "../common.js";

/**
 * Bank financing case registry — inquiry / negotiation / monitoring.
 * L2 personal values and bank account numbers must not appear here.
 */
export const bankFinancingStage = z.enum([
  "research",
  "inquiry",
  "diligence",
  "term_sheet",
  "closed",
  "declined",
  "monitoring",
]);

export const bankFinancingNegotiationEntrySchema = z.object({
  entry_id: z.string().regex(/^NEG-\d{8}-\d{3}$/),
  at: dateString,
  bank_question: z.string().min(1),
  draft_answer: z.string().optional(),
  adopted_answer: z.string().optional(),
  correspondence_draft_id: z.string().optional(),
  approval_id: z.string().optional(),
  notes: z.string().optional(),
});

export const bankFinancingCovenantWatchSchema = z.object({
  id: z.string().min(1),
  metric: z.enum(["dscr", "cash_runway_months", "other"]),
  threshold: z.number().optional(),
  report_cadence: z.enum(["monthly", "quarterly", "adhoc"]).default("monthly"),
  notes: z.string().optional(),
});

export const bankFinancingMonitoringEntrySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  generated_at: dateString,
  scenario_id: z.string().min(1),
  noi_proxy: z.number(),
  prorated_debt_service: z.number().nonnegative(),
  dscr: z.number().nullable(),
  covenant_status: z.enum(["ok", "warning", "not_applicable"]),
  report_refs: z.array(z.string().min(1)).min(1),
  correspondence_draft_id: z.string().optional(),
  approval_id: z.string().optional(),
  company_event_id: z.string().optional(),
});

export const bankFinancingCaseSchema = z.object({
  case_id: z.string().regex(/^CASE-BF-\d{3,}$/),
  title: z.string().min(1),
  stage: bankFinancingStage.default("research"),
  /** Display label only (bank/branch nickname). No account numbers. */
  bank_label: z.string().min(1),
  /** Link to stakeholders.yaml when present (gitignore-safe id). */
  bank_stakeholder_id: z.string().optional(),
  /** Link to external-contacts.yaml contact id when registered. */
  contact_ref: z.string().optional(),
  requested_scenario_id: z.string().min(1),
  amount: z.number().nonnegative(),
  /**
   * When true, `amount` is an illustrative scenario figure, not a firm inquiry.
   * Defaults true for research-stage workflows.
   */
  amount_undecided: z.boolean().default(true),
  purpose: z.string().min(1),
  currency: z.literal("JPY").default("JPY"),
  target_close_date: dateString.optional(),
  next_action_due: dateString.optional(),
  next_action: z.string().optional(),
  pack_refs: z.array(z.string().min(1)).default([]),
  negotiation_log: z.array(bankFinancingNegotiationEntrySchema).default([]),
  covenant_watch: z.array(bankFinancingCovenantWatchSchema).default([]),
  monitoring_log: z.array(bankFinancingMonitoringEntrySchema).default([]),
  correspondence_draft_ids: z.array(z.string().min(1)).default([]),
  approval_ids: z.array(z.string().min(1)).default([]),
  company_event_ids: z.array(z.string().min(1)).default([]),
  notes: z.string().optional(),
});

export const bankFinancingCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: dateString.optional(),
  cases: z.array(bankFinancingCaseSchema).default([]),
  notes: z.string().optional(),
});

export type BankFinancingStage = z.output<typeof bankFinancingStage>;
export type BankFinancingCase = z.output<typeof bankFinancingCaseSchema>;
export type BankFinancingCasesFile = z.output<
  typeof bankFinancingCasesFileSchema
>;
export type BankFinancingNegotiationEntry = z.output<
  typeof bankFinancingNegotiationEntrySchema
>;
export type BankFinancingMonitoringEntry = z.output<
  typeof bankFinancingMonitoringEntrySchema
>;
