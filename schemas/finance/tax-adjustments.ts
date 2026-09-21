import { z } from "zod";

/** Book-tax adjustment line for 別表四相当. Judgment is supplied, not invented. */
export const corporateTaxAdjustmentLineSchema = z.object({
  code: z.string().min(1),
  direction: z.enum(["add", "subtract"]),
  amount_yen: z.number().int().nonnegative(),
  status: z.enum(["confirmed", "pending"]),
  label: z.string().min(1),
});

export const corporateTaxAdjustmentLinesSchema = z.array(
  corporateTaxAdjustmentLineSchema,
);

export type CorporateTaxAdjustmentLine = z.infer<
  typeof corporateTaxAdjustmentLineSchema
>;
