import { z } from "zod";
import { monthString } from "../common.js";

export const openingBalanceLineSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  debit_yen: z.number().int().nonnegative().default(0),
  credit_yen: z.number().int().nonnegative().default(0),
});

export const openingBalancesSchema = z
  .object({
    version: z.literal(1).default(1),
    fiscal_year: z.string().min(1),
    period_start: monthString,
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.enum(["JPY"]).default("JPY"),
    lines: z.array(openingBalanceLineSchema).default([]),
    notes: z.string().optional(),
  })
  .superRefine((file, ctx) => {
    file.lines.forEach((line, index) => {
      if (
        (line.debit_yen === 0 && line.credit_yen === 0) ||
        (line.debit_yen > 0 && line.credit_yen > 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", index],
          message: "opening balance line must be debit or credit only",
        });
      }
    });
  });

export type OpeningBalancesFile = z.output<typeof openingBalancesSchema>;
export type OpeningBalanceLine = z.output<typeof openingBalanceLineSchema>;
