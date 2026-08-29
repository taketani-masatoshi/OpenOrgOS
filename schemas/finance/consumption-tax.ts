import { z } from "zod";
import { monthString } from "../common.js";
import { taxCategorySchema } from "./journal-entry.js";

export const consumptionTaxMethodSchema = z.enum(["standard", "simplified"]);
export const consumptionTaxNetDirectionSchema = z.enum(["payable", "refund_candidate"]);
export const consumptionTaxClaimKindSchema = z.enum([
  "principle_net",
  "export",
  "simplified",
  "interim",
]);
export const consumptionTaxGateSchema = z.enum(["open", "blocked"]);
/** 簡易課税のみなし仕入率（卸 90 … 不動産 40）。 */
export const deemedPurchaseRatePctSchema = z.union([
  z.literal(40),
  z.literal(50),
  z.literal(60),
  z.literal(70),
  z.literal(80),
  z.literal(90),
]);

export const consumptionTaxPeriodSchema = z.object({
  period: monthString,
  taxable_sales_10_yen: z.number().int().nonnegative().default(0),
  taxable_sales_8_yen: z.number().int().nonnegative().default(0),
  exempt_sales_yen: z.number().int().nonnegative().default(0),
  tax_free_sales_yen: z.number().int().nonnegative().default(0),
  taxable_purchases_10_yen: z.number().int().nonnegative().default(0),
  taxable_purchases_8_yen: z.number().int().nonnegative().default(0),
  non_deductible_purchase_tax_yen: z.number().int().nonnegative().default(0),
  transitional_deduction_rate_pct: z
    .union([z.literal(80), z.literal(50), z.literal(100)])
    .optional(),
  deemed_purchase_rate_pct: deemedPurchaseRatePctSchema.optional(),
});

export const consumptionTaxSummarySchema = z.object({
  period: monthString,
  output_tax_yen: z.number().int().nonnegative(),
  input_tax_yen: z.number().int().nonnegative(),
  net_tax_yen: z.number().int(),
  refund_candidate_yen: z.number().int().nonnegative(),
  direction: consumptionTaxNetDirectionSchema,
  method: consumptionTaxMethodSchema,
  exempt_sales_yen: z.number().int().nonnegative().default(0),
  tax_free_sales_yen: z.number().int().nonnegative().default(0),
  deemed_purchase_rate_pct: deemedPurchaseRatePctSchema.optional(),
  lines: z.array(
    z.object({
      tax_category: taxCategorySchema,
      base_yen: z.number().int().nonnegative(),
      tax_yen: z.number().int().nonnegative(),
      direction: z.enum(["sales", "purchase"]),
    }),
  ),
});

export const consumptionTaxEligibilityLineSchema = z.object({
  kind: consumptionTaxClaimKindSchema,
  gate: consumptionTaxGateSchema,
  reason: z.string().min(1),
});

export const consumptionTaxEligibilitySchema = z.object({
  period: monthString,
  method: consumptionTaxMethodSchema,
  refund_candidate_yen: z.number().int().nonnegative(),
  tax_free_sales_yen: z.number().int().nonnegative(),
  kinds: z.array(consumptionTaxEligibilityLineSchema),
});

export type ConsumptionTaxPeriod = z.output<typeof consumptionTaxPeriodSchema>;
export type ConsumptionTaxSummary = z.output<typeof consumptionTaxSummarySchema>;
export type ConsumptionTaxMethod = z.output<typeof consumptionTaxMethodSchema>;
export type ConsumptionTaxClaimKind = z.output<typeof consumptionTaxClaimKindSchema>;
export type ConsumptionTaxEligibility = z.output<typeof consumptionTaxEligibilitySchema>;
export type DeemedPurchaseRatePct = z.output<typeof deemedPurchaseRatePctSchema>;
