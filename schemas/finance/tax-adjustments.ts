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
