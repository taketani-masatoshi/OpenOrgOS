import { z } from "zod";
import { revenueCategory, expenseCategory } from "./monthly-loans.js";

export const chartAccountSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  name: z.string().min(1),
  type: z.string().min(1),
  normal_balance: z.enum(["debit", "credit"]),
  data_source: z.string().optional(),
  filter: z.string().optional(),
  field: z.string().optional(),
  property_ids: z.array(z.string()).optional(),
  contract_ids: z.array(z.string()).optional(),
  line_id: z.string().optional(),
  note: z.string().optional(),
});

export const chartOfAccountsSchema = z.object({
  version: z.string().optional(),
  currency: z.enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"]).default("JPY"),
  accounts: z.array(chartAccountSchema).min(1),
  category_mapping: z.object({
    revenue: z.record(revenueCategory, z.string()),
    expense: z.record(expenseCategory, z.string()),
  }),
  monthly_close_adjustments: z
    .array(
      z.object({
        trigger: z.string(),
        debit: z.string(),
        credit: z.string(),
        amount_source: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  notes: z.string().optional(),
});
