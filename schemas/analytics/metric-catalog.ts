import { z } from "zod";
import { agentId } from "../classification.js";

/** Prefixes reserved by other SoT id spaces — metric ids must not use these. */
export const ANALYTICS_FOREIGN_ID_PREFIXES = [
  "CTR-",
  "PRJ-",
  "APP-",
  "PROP-",
  "BANK-",
  "EMP-",
  "PER-",
  "IMP-",
  "WO-",
  "CHG-",
  "STK-",
  "FUND-",
  "HO-",
  "REG-",
] as const;

export const ANALYTICS_METRIC_ID_RE = /^MET-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const analyticsMetricId = z
  .string()
  .regex(ANALYTICS_METRIC_ID_RE, "Metric id must be MET-[A-Z0-9-]+")
  .refine((id) => !ANALYTICS_FOREIGN_ID_PREFIXES.some((p) => id.startsWith(p)), {
    message: "Metric id collides with a foreign id prefix",
  });

export function isAnalyticsMetricId(id: string): boolean {
  return ANALYTICS_METRIC_ID_RE.test(id);
}

export function usesAnalyticsForeignIdPrefix(id: string): boolean {
  return ANALYTICS_FOREIGN_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export const metricCategory = z.enum(["finance", "hr", "compliance", "quality", "ops"]);
export const metricDirection = z.enum(["higher_better", "lower_better", "neutral"]);
export const metricUnit = z.enum(["yen", "count", "percent", "score", "months"]);

export const metricResolverId = z.enum([
  "finance.dashboard.cash_balance",
  "finance.dashboard.runway_months",
  "finance.dashboard.monthly_profit",
  "finance.variance.revenue_delta_pct",
  "hr.headcount.on_roster",
  "compliance.controls.gap_count",
  "quality.data_health.overall",
  "os_score.composite",
]);

export const metricDefinitionSchema = z
  .object({
    id: analyticsMetricId,
    title: z.string().min(1),
    category: metricCategory,
    resolver: metricResolverId,
    direction: metricDirection,
    unit: metricUnit,
    owner_agent: agentId,
    threshold_warning_pct: z.number().optional(),
    threshold_critical_pct: z.number().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const metricsCatalogFileSchema = z
  .object({
    version: z.literal(1),
    as_of: z.string().optional(),
    metrics: z.array(metricDefinitionSchema).default([]),
    notes: z.string().optional(),
  })
  .strict();

export const kpiTargetSchema = z
  .object({
    metric_id: analyticsMetricId,
    target_value: z.number(),
    notes: z.string().optional(),
  })
  .strict();

export const kpiTargetsFileSchema = z
  .object({
    version: z.literal(1),
    fiscal_year: z.string().min(1),
    targets: z.array(kpiTargetSchema).default([]),
    notes: z.string().optional(),
  })
  .strict();

/** Disallowed field names that would imply L2 actuals stored in catalog files. */
export const ANALYTICS_FORBIDDEN_VALUE_FIELDS = [
  "actual_value",
  "current_value",
  "bank_account",
  "account_number",
  "employee_name",
  "personal_name",
] as const;

export type MetricCategory = z.output<typeof metricCategory>;
export type MetricDirection = z.output<typeof metricDirection>;
export type MetricUnit = z.output<typeof metricUnit>;
export type MetricResolverId = z.output<typeof metricResolverId>;
export type MetricDefinition = z.output<typeof metricDefinitionSchema>;
export type MetricsCatalogFile = z.output<typeof metricsCatalogFileSchema>;
export type KpiTarget = z.output<typeof kpiTargetSchema>;
export type KpiTargetsFile = z.output<typeof kpiTargetsFileSchema>;

export const snapshotHistoryEntrySchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
    values: z.record(analyticsMetricId, z.number()),
  })
  .strict();

export const snapshotHistoryFileSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(snapshotHistoryEntrySchema).default([]),
  })
  .strict();

export type SnapshotHistoryEntry = z.output<typeof snapshotHistoryEntrySchema>;
export type SnapshotHistoryFile = z.output<typeof snapshotHistoryFileSchema>;
