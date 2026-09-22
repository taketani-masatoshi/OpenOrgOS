import { z } from "zod";

export const taxAdjustmentLineSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["add", "subtract"]),
  amount_yen: z.number().int().nonnegative(),
  label: z.string().min(1),
  /** 別表四の行番号。行11または行22に入る許可行だけが公式合計に入る。 */
  form_row: z
    .string()
    .regex(/^\d{1,2}$/)
    .optional(),
});

export const taxAdjustmentsFileSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  lines: z.array(taxAdjustmentLineSchema).default([]),
});

export type TaxAdjustmentLine = z.output<typeof taxAdjustmentLineSchema>;
export type TaxAdjustmentsFile = z.output<typeof taxAdjustmentsFileSchema>;
