import { z } from "zod";

export const taxAdjustmentLineSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["add", "subtract"]),
  amount_yen: z.number().int().nonnegative(),
  label: z.string().min(1),
});

export const taxAdjustmentsFileSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  lines: z.array(taxAdjustmentLineSchema).default([]),
});

export type TaxAdjustmentLine = z.output<typeof taxAdjustmentLineSchema>;
export type TaxAdjustmentsFile = z.output<typeof taxAdjustmentsFileSchema>;

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
