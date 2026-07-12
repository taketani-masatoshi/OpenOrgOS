import { z } from "zod";
import { dateString } from "./common.js";

export const cashflowDirection = z.enum(["inflow", "outflow", "transfer"]);
export const cashflowLineSource = z.enum([
  "actual",
  "planned",
  "ar-ap",
  "tax-calendar",
  "payment-calendar",
  "forecast",
  "import",
  "aggregate",
]);

export const paymentCalendarEntrySchema = z.object({
  id: z.string().min(1),
  date: dateString,
  direction: cashflowDirection,
  amount: z.number(),
  category: z.string().min(1),
  account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  counterparty_account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  chart_account_id: z.string().optional(),
  description: z.string().min(1),
  source: cashflowLineSource.default("payment-calendar"),
  status: z.enum(["planned", "confirmed", "paid", "cancelled"]).default("planned"),
  notes: z.string().optional(),
});

export const paymentCalendarFileSchema = z.object({
  as_of: dateString.optional(),
  currency: z.literal("JPY").default("JPY"),
  entries: z.array(paymentCalendarEntrySchema).default([]),
  notes: z.string().optional(),
});

export const arApKind = z.enum(["ar", "ap"]);
export const arApStatus = z.enum(["open", "partial", "collected", "paid", "cancelled"]);
export const arApDueDateSource = z.enum([
  "explicit",
  "collection-term",
  "invoice-payment-due-date",
]);
export const arApOriginSource = z.enum(["invoice", "billing", "contract", "import"]);

export const arApEntrySchema = z.object({
  id: z.string().min(1),
  kind: arApKind,
  amount: z.number().positive(),
  /** Amount already collected (AR) or paid (AP). Required semantics for status=partial. */
  paid_amount: z.number().nonnegative().optional(),
  category: z.string().min(1).optional(),
  booked_date: dateString,
  due_date: dateString,
  collected_or_paid_date: dateString.optional(),
  counterparty: z.string().min(1),
  description: z.string().min(1),
  account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  chart_account_id: z.string().optional(),
  contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
  invoice_id: z.string().optional(),
  collection_term_id: z.string().min(1).optional(),
  due_date_source: arApDueDateSource.optional(),
  origin_source: arApOriginSource.optional(),
  origin_id: z.string().min(1).optional(),
  status: arApStatus.default("open"),
  source: cashflowLineSource.default("ar-ap"),
  notes: z.string().optional(),
});

export const arApLedgerFileSchema = z.object({
  as_of: dateString.optional(),
  currency: z.literal("JPY").default("JPY"),
  entries: z.array(arApEntrySchema).default([]),
  notes: z.string().optional(),
});

export const collectionTermRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: arApKind,
  days_after_booking: z.number().int().nonnegative().default(0),
  days_after_month_end: z.number().int().nonnegative().optional(),
  default_account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  chart_account_id: z.string().optional(),
  notes: z.string().optional(),
});

export const collectionTermsFileSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  rules: z.array(collectionTermRuleSchema).default([]),
  notes: z.string().optional(),
});

export const bankStatementEntrySchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  date: dateString,
  direction: z.enum(["inflow", "outflow"]),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  account_id: z.string().regex(/^BANK-\d{3,}$/),
  chart_account_id: z.string().optional(),
  reference: z.string().optional(),
  counterparty: z.string().optional(),
  import_batch_id: z.string().min(1).optional(),
  /** Compatibility snapshot only. Reconciliation events are authoritative. */
  status: z.enum(["matched", "partial", "unmatched"]).default("unmatched"),
  source: z.literal("import").default("import"),
});

export const bankStatementFileSchema = z.object({
  as_of: dateString.optional(),
  currency: z.literal("JPY").default("JPY"),
  import_batches: z
    .array(
      z.object({
        id: z.string().min(1),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        imported_at: z.string().datetime(),
        adapter: z.string().min(1).default("generic-csv"),
        account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
        period_start: dateString.optional(),
        period_end: dateString.optional(),
        opening_balance: z.number().nonnegative().optional(),
        closing_balance: z.number().nonnegative().optional(),
        entry_ids: z.array(z.string().min(1)).default([]),
      })
    )
    .default([]),
  entries: z.array(bankStatementEntrySchema).default([]),
  notes: z.string().optional(),
});

export const reconciliationAllocationSchema = z.object({
  bank_statement_id: z.string().min(1),
  ar_ap_id: z.string().min(1),
  amount: z.number().positive(),
});

export const reconciliationAppliedEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal("reconciliation.applied"),
  occurred_at: z.string().datetime(),
  effective_date: dateString,
  actor_id: z.string().min(1),
  match_mode: z.enum(["exact_auto", "approved"]),
  rule_id: z.string().min(1).optional(),
  proposal_id: z.string().min(1).optional(),
  allocations: z.array(reconciliationAllocationSchema).min(1),
  reason: z.string().min(1).optional(),
});

export const reconciliationReversedEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal("reconciliation.reversed"),
  occurred_at: z.string().datetime(),
  effective_date: dateString,
  actor_id: z.string().min(1),
  target_event_id: z.string().min(1),
  reason: z.string().min(1),
});

export const bankStatementVoidedEventSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bank_statement.voided"),
  occurred_at: z.string().datetime(),
  effective_date: dateString,
  actor_id: z.string().min(1),
  bank_statement_id: z.string().min(1),
  reason: z.string().min(1),
});

export const reconciliationEventSchema = z.discriminatedUnion("type", [
  reconciliationAppliedEventSchema,
  reconciliationReversedEventSchema,
  bankStatementVoidedEventSchema,
]);

export const reconciliationEventFileSchema = z.object({
  version: z.literal("1").default("1"),
  currency: z.literal("JPY").default("JPY"),
  events: z.array(reconciliationEventSchema).default([]),
});

export const cashflowGranularity = z.enum(["daily", "weekly", "monthly"]);

export const cashflowScheduleRowSchema = z.object({
  period_key: z.string().min(1),
  period_start: dateString,
  period_end: dateString,
  direction: cashflowDirection,
  category: z.string().min(1),
  description: z.string().min(1),
  account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  chart_account_id: z.string().optional(),
  planned_amount: z.number(),
  actual_amount: z.number().nullable().optional(),
  forecast_amount: z.number().nullable().optional(),
  balance_total: z.number(),
  balance_by_account: z.record(z.string(), z.number()).default({}),
  source: cashflowLineSource,
  line_id: z.string().optional(),
  detail_count: z.number().int().nonnegative().optional(),
  detail_line_ids: z.array(z.string()).optional(),
  detail_schedule_path: z.string().optional(),
});

export const cashflowScheduleSchema = z.object({
  generated_at: z.string(),
  granularity: cashflowGranularity,
  horizon_start: dateString,
  horizon_end: dateString,
  opening_balance_as_of: dateString.optional(),
  balance_age_days: z.number().int().nonnegative().optional(),
  opening_balance_total: z.number(),
  opening_balance_by_account: z.record(z.string(), z.number()).default({}),
  closing_balance_total: z.number(),
  closing_balance_by_account: z.record(z.string(), z.number()).default({}),
  runway_days: z.number().nullable().optional(),
  shortfall_date: dateString.nullable().optional(),
  shortfall_amount: z.number().nullable().optional(),
  required_funding_amount: z.number().nonnegative().nullable().optional(),
  required_funding_by_date: dateString.nullable().optional(),
  rows: z.array(cashflowScheduleRowSchema),
  detail_rows: z.array(cashflowScheduleRowSchema).optional(),
  detail_schedule_path: z.string().optional(),
  input_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  tie_out_status: z.enum(["passed", "failed", "not_available"]).optional(),
  warnings: z.array(z.string()).default([]),
});

export const cashflowExportSource = z.enum([
  "cashflow-schedule",
  "mizuho-weekly",
  "tax-payments",
]);

export const cashflowExportColumnKey = z.enum([
  "period_key",
  "period_start",
  "period_end",
  "date",
  "week_start",
  "week_end",
  "direction",
  "category",
  "description",
  "chart_account_id",
  "planned_amount",
  "actual_amount",
  "forecast_amount",
  "inflow_amount",
  "outflow_amount",
  "amount",
  "balance_total",
  "account_id",
  "bank_account_id",
  "source",
  "line_id",
  "detail_count",
  "detail_line_ids",
  "tax_id",
  "tax_name",
]);

export const cashflowExportTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  label: z.string().min(1),
  source: cashflowExportSource.default("cashflow-schedule"),
  columns: z
    .array(
      z.object({
        key: cashflowExportColumnKey,
        header: z.string().min(1),
        when: z.enum(["inflow", "outflow", "transfer"]).optional(),
      })
    )
    .min(1),
  encoding: z.literal("utf-8").default("utf-8"),
  delimiter: z.string().length(1).default(","),
  notes: z.string().optional(),
});

export type PaymentCalendarEntry = z.output<typeof paymentCalendarEntrySchema>;
export type PaymentCalendarFile = z.output<typeof paymentCalendarFileSchema>;
export type ArApEntry = z.output<typeof arApEntrySchema>;
export type ArApLedgerFile = z.output<typeof arApLedgerFileSchema>;
export type CollectionTermsFile = z.output<typeof collectionTermsFileSchema>;
export type BankStatementEntry = z.output<typeof bankStatementEntrySchema>;
export type BankStatementFile = z.output<typeof bankStatementFileSchema>;
export type BankStatementImportBatch = BankStatementFile["import_batches"][number];
export type ReconciliationAllocation = z.output<typeof reconciliationAllocationSchema>;
export type ReconciliationEvent = z.output<typeof reconciliationEventSchema>;
export type ReconciliationEventFile = z.output<typeof reconciliationEventFileSchema>;
export type CashflowGranularity = z.output<typeof cashflowGranularity>;
export type CashflowScheduleRow = z.output<typeof cashflowScheduleRowSchema>;
export type CashflowSchedule = z.output<typeof cashflowScheduleSchema>;
export type CashflowExportTemplate = z.output<typeof cashflowExportTemplateSchema>;
