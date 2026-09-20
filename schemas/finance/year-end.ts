import { z } from "zod";

export const yearEndAccrualSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["accrual", "prepaid", "provision"]),
  label: z.string().min(1),
  amount_yen: z.number().int().nonnegative(),
});

export const yearEndDeclarationSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  inventory: z.enum(["none", "counted"]),
  accruals: z.array(yearEndAccrualSchema),
  subsequent_events: z.discriminatedUnion("status", [
    z.object({ status: z.literal("none") }),
    z.object({ status: z.literal("disclosed"), text: z.string().min(1) }),
  ]),
  consumption_tax: z.enum(["exempt", "settled"]),
});

export type YearEndDeclaration = z.output<typeof yearEndDeclarationSchema>;
