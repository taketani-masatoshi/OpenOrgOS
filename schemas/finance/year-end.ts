import { z } from "zod";

export const yearEndAccrualSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["accrual", "prepaid", "provision"]),
  label: z.string().min(1),
  amount_yen: z.number().int().nonnegative(),
});

/** Optional so a declaration written for tax worksheets still parses. */
export const yearEndSurplusDisposalSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none") }),
  z.object({ status: z.literal("dividend") }),
]);

export const yearEndDeclarationSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  inventory: z.enum(["none", "counted"]),
  accruals: z.array(yearEndAccrualSchema),
  subsequent_events: z.discriminatedUnion("status", [
    z.object({ status: z.literal("none") }),
    z.object({ status: z.literal("disclosed"), text: z.string().min(1) }),
  ]),
  consumption_tax: z.enum(["exempt", "settled"]),
  surplus_disposal: yearEndSurplusDisposalSchema.optional(),
});

export type YearEndDeclaration = z.output<typeof yearEndDeclarationSchema>;
