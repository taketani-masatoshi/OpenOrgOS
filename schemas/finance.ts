import { z } from "zod";
import { dateString, monthString } from "./common.js";

export const revenueCategory = z.enum([
  "rent",
  "hotel_revenue",
  "other_revenue",
]);

export const expenseCategory = z.enum([
  "repair",
  "cleaning",
  "management_fee",
  "utilities",
  "other_property",
  "fixed_rent",
  "communication",
  "insurance",
  "advisory",
  "system",
  "loan_payment",
  "capex",
  "other",
]);

export const revenueEntry = z.object({
  property_id: z.string().optional(),
  category: revenueCategory,
  amount: z.number(),
  notes: z.string().optional(),
});

export const expenseEntry = z.object({
  property_id: z.string().optional(),
  category: expenseCategory,
  amount: z.number(),
  notes: z.string().optional(),
});

export const monthlyFinanceSchema = z.object({
  month: monthString,
  revenue: z.array(revenueEntry).default([]),
  expenses: z.array(expenseEntry).default([]),
  notes: z.string().optional(),
});

export const fixedCostItem = z.object({
  name: z.string().min(1),
  monthly_amount: z.number().nonnegative(),
  annual_amount: z.number().nonnegative().optional(),
});

export const fixedCostsSchema = z.object({
  items: z.array(fixedCostItem).default([]),
});

export const loanDocumentsSchema = z.object({
  executed: z.string().optional(),
  repayment: z.string().optional(),
});

export const loanSchema = z.object({
  id: z.string().regex(/^LOAN-\d{3,}$/),
  lender: z.string().min(1),
  property_id: z.string().optional(),
  contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
  balance: z.number().nonnegative(),
  interest_rate: z.number().min(0),
  monthly_payment: z.number().nonnegative(),
  maturity_date: dateString,
  executed_date: dateString.optional(),
  conflict_approval: z.string().optional(),
  documents: loanDocumentsSchema.optional(),
  fixed_asset_ids: z.array(z.string().regex(/^ASSET-\d{3,}$/)).optional(),
  account_code_liability: z.string().optional(),
  tax_notes: z.string().optional(),
  notes: z.string().optional(),
});

export const loansSchema = z.object({
  loans: z.array(loanSchema).default([]),
});

export const businessPlanYear = z.object({
  year: z.number().int(),
  revenue_plan: z.number(),
  operating_profit_plan: z.number(),
  investment_plan: z.number(),
  borrowing_plan: z.number(),
  notes: z.string().optional(),
});

export const kpiItem = z.object({
  name: z.string().min(1),
  target: z.string().min(1),
  unit: z.string().optional(),
});

export const businessSegment = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  revenue_driver: z.string().optional(),
});

export const businessPlanSchema = z.object({
  period: z.string().optional(),
  vision: z.string().optional(),
  mid_term_goals: z.array(z.string()).default([]),
  segments: z.array(businessSegment).default([]),
  kpi: z.array(kpiItem).default([]),
  years: z.array(businessPlanYear).default([]),
  funding_plan: z.string().optional(),
  notes: z.string().optional(),
});

export const rentalRevenuePlan = z.object({
  property_id: z.string(),
  monthly_rent: z.number().nonnegative(),
  annual_rent: z.number().nonnegative().optional(),
  vacancy_rate: z.number().min(0).max(1),
  management_fee: z.number().nonnegative(),
});

export const hotelRevenuePlan = z.object({
  property_id: z.string(),
  room_count: z.number().int().positive(),
  occupancy_rate: z.number().min(0).max(1),
  adr: z.number().nonnegative(),
});

export const propertyRevenuePlanSchema = z.object({
  rental: z.array(rentalRevenuePlan).default([]),
  hotel: z.array(hotelRevenuePlan).default([]),
});

export const payrollSchema = z.object({
  officer_compensation_annual: z.number().nonnegative().default(0),
  officers: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        monthly: z.number().nonnegative().optional(),
        annual: z.number().nonnegative().optional(),
      })
    )
    .optional(),
  tax_treatment: z
    .object({
      withholding: z.string().optional(),
      social_insurance: z.string().optional(),
      deductible_expense: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  account_code: z.string().optional(),
  notes: z.string().optional(),
});

export const yojitsuLineKind = z.enum(["revenue", "expense", "depreciation", "capex"]);

/** yojitsu v2 — business-plan segments[].name と kind で計画・実績行を表現 */
export const yojitsuLineSchema = z.object({
  segment: z.string().min(1),
  kind: yojitsuLineKind,
  amount: z.number().nonnegative(),
  label: z.string().optional(),
});

export const yojitsuMonthSideSchema = z.object({
  lines: z.array(yojitsuLineSchema).default([]),
});

/** @deprecated v1 — MAL 固定列。読込時に v2 lines[] へ正規化（互換レイヤ） */
export const yojitsuLegacyMonthPlan = z.object({
  revenue_bancho: z.number().nonnegative().default(0),
  revenue_kamezawa: z.number().nonnegative().default(0),
  revenue_translation: z.number().nonnegative().default(0),
  revenue_services: z.number().nonnegative().default(0),
  expense_bancho: z.number().nonnegative().default(0),
  expense_kamezawa: z.number().nonnegative().default(0),
  expense_officer: z.number().nonnegative().default(0),
  expense_company: z.number().nonnegative().default(0),
  depreciation: z.number().nonnegative().default(0),
  capex: z.number().nonnegative().default(0),
});

export const yojitsuLegacyMonthActual = yojitsuLegacyMonthPlan.partial();

/** plan / actual — v2（lines 必須）または v1 固定列 */
export const yojitsuMonthSideV2RawSchema = z.object({
  lines: z.array(yojitsuLineSchema),
});

export const yojitsuMonthSideRawSchema = z.union([
  yojitsuMonthSideV2RawSchema,
  yojitsuLegacyMonthPlan,
]);

export const yojitsuMonthSideActualRawSchema = z.union([
  yojitsuMonthSideV2RawSchema.partial(),
  yojitsuLegacyMonthActual,
]);

export const yojitsuMonthSchema = z.object({
  month: monthString,
  plan: yojitsuMonthSideRawSchema,
  actual: yojitsuMonthSideActualRawSchema.optional(),
  notes: z.string().optional(),
});

/** @deprecated alias — v1 月次計画フィールド名 */
export const yojitsuMonthPlan = yojitsuLegacyMonthPlan;
export const yojitsuMonthActual = yojitsuLegacyMonthActual;
export const yojitsuMonth = yojitsuMonthSchema;

export const yojitsuClosingSchema = z.object({
  status: z.enum(["open", "closed"]),
  basis: z.enum(["actual", "forecast"]).optional(),
  closed_at: z.string().optional(),
  notes: z.string().optional(),
});

export const yojitsuSummarySchema = z.object({
  revenue_total: z.number().nonnegative().optional(),
  operating_profit: z.number().optional(),
  pretax_profit: z.number().optional(),
  tax_estimate: z.number().nonnegative().optional(),
  net_profit: z.number().optional(),
});

export const yojitsuPlanSchema = z.object({
  year: z.number().int(),
  fiscal_year: z.string().optional(),
  period_from: monthString.optional(),
  period_to: monthString.optional(),
  assumptions: z.string().optional(),
  closing: yojitsuClosingSchema.optional(),
  summary: yojitsuSummarySchema.optional(),
  months: z.array(yojitsuMonthSchema).default([]),
  schema_version: z.literal(2).optional(),
});

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
  currency: z.literal("JPY").default("JPY"),
  accounts: z.array(cashBalanceAccountSchema).default([]),
  total: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export type CashBalance = z.infer<typeof cashBalanceSchema>;

export const assetCategory = z.enum(["土地", "建物", "構築物", "器具備品", "その他"]);

export const depreciationMethodTax = z.enum(["定額法", "定率法", "非償却"]);

export const fixedAssetSchema = z.object({
  id: z.string().regex(/^ASSET-\d{3,}$/),
  property_id: z.string().regex(/^PROP-\d{3,}$/),
  loan_id: z.string().regex(/^LOAN-\d{3,}$/).optional(),
  contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
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
  currency: z.literal("JPY").default("JPY"),
  assets: z.array(fixedAssetSchema).min(1),
  summary: fixedAssetsSummarySchema.optional(),
  notes: z.string().optional(),
});

export const taxProfileEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  corporate_number: z.string().optional(),
  address: z.string().optional(),
});

export const taxProfileFiscalYearSchema = z.object({
  end_month: z.number().int().min(1).max(12),
  label: z.string().optional(),
  period_from: dateString.optional(),
  period_to: dateString.optional(),
  calendar_note: z.string().optional(),
});

export const taxProfileConsumptionTaxSchema = z.object({
  status: z.union([z.literal("TBD"), z.string()]),
  options: z.array(z.string()).optional(),
  invoice_registration_number: z.string().optional(),
  invoice_registered: z.boolean().optional(),
  base_period_sales_threshold: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const taxProfileCorporateTaxSchema = z.object({
  category: z.string().optional(),
  applicable_rates: z.record(z.string()).optional(),
  capital_stock: z.union([z.literal("TBD"), z.number().nonnegative()]).optional(),
  prior_retained_earnings: z.union([z.literal("TBD"), z.number()]).optional(),
  estimated_tax_fy2026: z.number().nonnegative().optional(),
  estimated_tax_status: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileFilingCalendarItemSchema = z.object({
  id: z.string().min(1),
  tax: z.string().min(1),
  authority: z.string().optional(),
  deadline: dateString.optional(),
  status: z.union([z.literal("TBD"), z.string()]).optional(),
  attachments: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export const taxProfileSchema = z.object({
  entity: taxProfileEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  consumption_tax: taxProfileConsumptionTaxSchema,
  corporate_tax: taxProfileCorporateTaxSchema,
  local_tax: z
    .object({
      prefecture: z.string().optional(),
      municipalities: z
        .array(
          z.object({
            name: z.string(),
            assets: z.array(z.string()).optional(),
            taxes: z.array(z.string()).optional(),
          })
        )
        .optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

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
  currency: z.literal("JPY").default("JPY"),
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

export type FixedAssets = z.infer<typeof fixedAssetsSchema>;
export type FixedAsset = z.infer<typeof fixedAssetSchema>;
export type TaxProfile = z.infer<typeof taxProfileSchema>;
export type ChartOfAccounts = z.infer<typeof chartOfAccountsSchema>;

export type YojitsuLineKind = z.infer<typeof yojitsuLineKind>;
export type YojitsuLine = z.infer<typeof yojitsuLineSchema>;
export type YojitsuMonthSide = z.infer<typeof yojitsuMonthSideSchema>;
export type YojitsuPlanRaw = z.infer<typeof yojitsuPlanSchema>;
export type YojitsuMonthRaw = z.infer<typeof yojitsuMonthSchema>;

/** 正規化後（months[].plan/actual は常に lines[]） */
export interface YojitsuMonth {
  month: string;
  plan: YojitsuMonthSide;
  actual?: YojitsuMonthSide;
  notes?: string;
}

export type YojitsuPlan = Omit<YojitsuPlanRaw, "months"> & {
  months: YojitsuMonth[];
};

export type MonthlyFinance = z.infer<typeof monthlyFinanceSchema>;
export type FixedCosts = z.infer<typeof fixedCostsSchema>;
export type Loans = z.infer<typeof loansSchema>;
export type BusinessPlan = z.infer<typeof businessPlanSchema>;
export type PropertyRevenuePlan = z.infer<typeof propertyRevenuePlanSchema>;
export type Loan = z.infer<typeof loanSchema>;
