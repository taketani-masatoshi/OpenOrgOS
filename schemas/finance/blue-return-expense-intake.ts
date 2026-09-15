import { z } from "zod";
import { dateString, monthString } from "../common.js";

/** 取得価額帯（原則税込。tax_inclusive で明示）。 */
export const blueReturnAmountBandSchema = z.enum([
  "under_100k",
  "from_100k_to_200k",
  "from_200k_to_300k",
  "from_300k",
]);

export const blueReturnBusinessUseSchema = z.enum(["business_only", "shared"]);

export const blueReturnDepreciationChoiceSchema = z.enum([
  "expense",
  "lump_sum",
  "sme_special",
  "ordinary_fixed_asset",
  "n_a",
]);

export const blueReturnRepairVsCapexSchema = z.enum(["repair", "capex", "unclear"]);

export const blueReturnExpenseTimingSchema = z.enum([
  "current_expense",
  "prepaid",
  "accrued",
]);

export const blueReturnAllocationWriteModeSchema = z.enum([
  "update_yaml",
  "journal_business_only",
]);

export const blueReturnExpenseIntakeSchema = z.object({
  intake_id: z.string().min(1),
  reported_at: z.string().min(10),
  amount_yen: z.number().int().positive(),
  tax_inclusive: z.boolean().default(true),
  business_use: blueReturnBusinessUseSchema.optional(),
  business_pct: z.number().min(0).max(100).optional(),
  owner_draw_split_done: z.boolean().optional(),
  amount_band: blueReturnAmountBandSchema.optional(),
  depreciation_choice: blueReturnDepreciationChoiceSchema.optional(),
  occurred_on: dateString.optional(),
  paid_on: dateString.optional(),
  placed_in_service_month: monthString.optional(),
  expense_line: z.string().min(1).optional(),
  account_code: z.string().regex(/^\d{4}$/).optional(),
  evidence_refs: z.array(z.string().min(1)).optional(),
  invoice_qualified: z.boolean().optional(),
  withholding_applicable: z.boolean().optional(),
  bundle_or_split_purchase: z.boolean().optional(),
  repair_vs_capex: blueReturnRepairVsCapexSchema.optional(),
  timing: blueReturnExpenseTimingSchema.optional(),
  allocation_write_mode: blueReturnAllocationWriteModeSchema.optional(),
  status: z.enum(["draft", "complete"]).default("draft"),
  notes: z.string().optional(),
});

export const blueReturnExpenseIntakesFileSchema = z.object({
  version: z.union([z.literal(1), z.number()]).default(1),
  calendar_year: z.number().int().optional(),
  intakes: z.array(blueReturnExpenseIntakeSchema).default([]),
});

export type BlueReturnExpenseIntake = z.output<typeof blueReturnExpenseIntakeSchema>;
export type BlueReturnExpenseIntakesFile = z.output<typeof blueReturnExpenseIntakesFileSchema>;
export type BlueReturnAmountBand = z.output<typeof blueReturnAmountBandSchema>;
