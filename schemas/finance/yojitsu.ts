import { z } from "zod";
import { monthString } from "../common.js";
export const yojitsuLineKind = z.enum(["revenue", "expense", "depreciation", "capex"]);

/** yojitsu v2 — business-plan segments[].name と kind で計画・実績行を表現 */
export const yojitsuLineSchema = z.object({
  segment: z.string().min(1),
  kind: yojitsuLineKind,
  amount: z.number().nonnegative(),
  label: z.string().optional(),
});

export const yojitsuMonthSideSchema = z.object({
  lines: z.array(yojitsuLineSchema).default([]),
});

/** @deprecated v1 — MAL 固定列。読込時に v2 lines[] へ正規化（互換レイヤ） */
export const yojitsuLegacyMonthPlan = z.object({
  revenue_bancho: z.number().nonnegative().default(0),
  revenue_kamezawa: z.number().nonnegative().default(0),
  revenue_translation: z.number().nonnegative().default(0),
  revenue_services: z.number().nonnegative().default(0),
  expense_bancho: z.number().nonnegative().default(0),
  expense_kamezawa: z.number().nonnegative().default(0),
  expense_officer: z.number().nonnegative().default(0),
  expense_company: z.number().nonnegative().default(0),
  depreciation: z.number().nonnegative().default(0),
  capex: z.number().nonnegative().default(0),
});

export const yojitsuLegacyMonthActual = yojitsuLegacyMonthPlan.partial();

/** plan / actual — v2（lines 必須）または v1 固定列 */
export const yojitsuMonthSideV2RawSchema = z.object({
  lines: z.array(yojitsuLineSchema),
});

export const yojitsuMonthSideRawSchema = z.union([
  yojitsuMonthSideV2RawSchema,
  yojitsuLegacyMonthPlan,
]);

export const yojitsuMonthSideActualRawSchema = z.union([
  yojitsuMonthSideV2RawSchema.partial(),
  yojitsuLegacyMonthActual,
]);

export const yojitsuMonthSchema = z.object({
  month: monthString,
  plan: yojitsuMonthSideRawSchema,
  actual: yojitsuMonthSideActualRawSchema.optional(),
  notes: z.string().optional(),
});

/** @deprecated alias — v1 月次計画フィールド名 */
export const yojitsuMonthPlan = yojitsuLegacyMonthPlan;
export const yojitsuMonthActual = yojitsuLegacyMonthActual;
export const yojitsuMonth = yojitsuMonthSchema;

export const yojitsuClosingSchema = z.object({
  status: z.enum(["open", "closed"]),
  basis: z.enum(["actual", "forecast"]).optional(),
  closed_at: z.string().optional(),
  notes: z.string().optional(),
});

export const yojitsuSummarySchema = z.object({
  revenue_total: z.number().nonnegative().optional(),
  operating_profit: z.number().optional(),
  pretax_profit: z.number().optional(),
  tax_estimate: z.number().nonnegative().optional(),
  net_profit: z.number().optional(),
});

export const yojitsuPlanSchema = z.object({
  year: z.number().int(),
  fiscal_year: z.string().optional(),
  period_from: monthString.optional(),
  period_to: monthString.optional(),
  assumptions: z.string().optional(),
  closing: yojitsuClosingSchema.optional(),
  summary: yojitsuSummarySchema.optional(),
  months: z.array(yojitsuMonthSchema).default([]),
  schema_version: z.literal(2).optional(),
});
