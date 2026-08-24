import { z } from "zod";
import { dateString, monthString } from "../common.js";
export const cashBalanceAccountSchema = z.object({
  id: z.string().min(1).optional(),
  bank_account_id: z.string().regex(/^BANK-\d{3,}$/).optional(),
  name: z.string().min(1).optional(),
  institution: z.string().optional(),
  amount: z.number().nonnegative().nullable().optional(),
}).refine(
  (a) => a.bank_account_id != null || (a.id != null && a.name != null),
  { message: "cash balance account requires bank_account_id or id+name" }
);

export const cashBalanceSchema = z.object({
  as_of: dateString,
  status: z.enum(["template", "confirmed"]),
  currency: z.enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"]).default("JPY"),
  accounts: z.array(cashBalanceAccountSchema).default([]),
  total: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export type CashBalance = z.output<typeof cashBalanceSchema>;

export const assetCategory = z.enum(["土地", "建物", "構築物", "器具備品", "その他"]);

export const depreciationMethodTax = z.enum(["定額法", "定率法", "非償却"]);

export const fixedAssetSchema = z
  .object({
    id: z.string().regex(/^ASSET-\d{3,}$/),
    property_id: z.string().regex(/^PROP-\d{3,}$/),
    loan_id: z.string().regex(/^LOAN-\d{3,}$/).optional(),
    contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
    name: z.string().min(1),
    category: assetCategory,
    acquisition_date: dateString.optional(),
    acquisition_month: monthString.optional(),
    placed_in_service_month: monthString.optional(),
    acquisition_cost: z.number().nonnegative(),
    useful_life_years: z.number().int().positive().nullable().optional(),
    /** Budget / tax-prep status — e.g. provisional_pending_structure */
    useful_life_status: z.string().optional(),
    useful_life_assumption: z.string().optional(),
    depreciation_method: depreciationMethodTax,
    annual_depreciation: z.number().nonnegative(),
    /**
     * Current FY depreciation amount for expense-plan / yojitsu reconcile.
     * Prefer over accumulated_depreciation heuristics when set.
     */
    fy_depreciation_jpy: z.number().nonnegative().optional(),
    accumulated_depreciation: z.number().nonnegative(),
    book_value: z.number().nonnegative(),
    expense_plan_line_id: z.string().nullable().optional(),
    /** yojitsu plan line match — segment name (exact). */
    yojitsu_segment: z.string().optional(),
    /** yojitsu depreciation label substring (e.g. 建物減価). */
    yojitsu_label_includes: z.string().optional(),
    /**
     * Useful-life advisor review workflow.
     * provisional assets should stay pending_advisor until confirmed.
     */
    useful_life_review: z
      .object({
        status: z.enum(["pending_advisor", "confirmed", "n/a"]).default("n/a"),
        evidence_path: z.string().optional(),
        due: dateString.optional(),
        notes: z.string().optional(),
      })
      .optional(),
    tax_notes: z.string().optional(),
  })
  .refine((asset) => asset.acquisition_date != null || asset.acquisition_month != null, {
    message: "fixed asset requires acquisition_date or acquisition_month",
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
  currency: z.enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"]).default("JPY"),
  assets: z.array(fixedAssetSchema).default([]),
  summary: fixedAssetsSummarySchema.optional(),
  notes: z.string().optional(),
});
