import { z } from "zod";
import { dateString } from "../common.js";
export const cashBalanceAccountSchema = z
  .object({
    id: z.string().min(1).optional(),
    bank_account_id: z
      .string()
      .regex(/^BANK-\d{3,}$/)
      .optional(),
    name: z.string().min(1).optional(),
    institution: z.string().optional(),
    amount: z.number().nonnegative().nullable().optional(),
  })
  .refine((a) => a.bank_account_id != null || (a.id != null && a.name != null), {
    message: "cash balance account requires bank_account_id or id+name",
  });

export const cashBalanceSchema = z.object({
  as_of: dateString,
  status: z.enum(["template", "confirmed"]),
  currency: z
    .enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"])
    .default("JPY"),
  accounts: z.array(cashBalanceAccountSchema).default([]),
  total: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export type CashBalance = z.output<typeof cashBalanceSchema>;

export const assetCategory = z.enum(["土地", "建物", "構築物", "器具備品", "その他"]);

export const depreciationMethodTax = z.enum(["定額法", "定率法", "非償却"]);

export const fixedAssetSchema = z.object({
  id: z.string().regex(/^ASSET-\d{3,}$/),
  property_id: z.string().regex(/^PROP-\d{3,}$/),
  loan_id: z
    .string()
    .regex(/^LOAN-\d{3,}$/)
    .optional(),
  contract_id: z
    .string()
    .regex(/^CTR-\d{3,}$/)
    .optional(),
  name: z.string().min(1),
  category: assetCategory,
  acquisition_date: dateString,
  acquisition_cost: z.number().nonnegative(),
  useful_life_years: z.number().int().positive().nullable().optional(),
  depreciation_method: depreciationMethodTax,
  annual_depreciation: z.number().nonnegative(),
  accumulated_depreciation: z.number().nonnegative(),
  book_value: z.number().nonnegative(),
  expense_plan_line_id: z.string().nullable().optional(),
  tax_notes: z.string().optional(),
});

export const fixedAssetsSummarySchema = z.object({
  total_acquisition_cost: z.number().nonnegative(),
  total_accumulated_depreciation: z.number().nonnegative(),
  total_book_value: z.number().nonnegative(),
  annual_depreciation_fy_current: z.number().nonnegative().optional(),
});

export const fixedAssetsSchema = z.object({
  as_of: dateString,
  fiscal_year: z.string().optional(),
  currency: z
    .enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"])
    .default("JPY"),
  assets: z.array(fixedAssetSchema).default([]),
  summary: fixedAssetsSummarySchema.optional(),
  notes: z.string().optional(),
});
