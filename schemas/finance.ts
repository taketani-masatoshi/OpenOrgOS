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
  notes: z.string().optional(),
});

export const yojitsuMonthPlan = z.object({
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

export const yojitsuMonthActual = yojitsuMonthPlan.partial();

export const yojitsuMonth = z.object({
  month: monthString,
  plan: yojitsuMonthPlan,
  actual: yojitsuMonthActual.optional(),
  notes: z.string().optional(),
});

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
  months: z.array(yojitsuMonth).default([]),
});

export const cashBalanceAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  institution: z.string().optional(),
  amount: z.number().nonnegative().nullable().optional(),
});

export const cashBalanceSchema = z.object({
  as_of: dateString,
  status: z.enum(["template", "confirmed"]),
  currency: z.literal("JPY").default("JPY"),
  accounts: z.array(cashBalanceAccountSchema).default([]),
  total: z.number().nonnegative().nullable().optional(),
  notes: z.string().optional(),
});

export type CashBalance = z.infer<typeof cashBalanceSchema>;

export type YojitsuPlan = z.infer<typeof yojitsuPlanSchema>;

export type MonthlyFinance = z.infer<typeof monthlyFinanceSchema>;
export type FixedCosts = z.infer<typeof fixedCostsSchema>;
export type Loans = z.infer<typeof loansSchema>;
export type BusinessPlan = z.infer<typeof businessPlanSchema>;
export type PropertyRevenuePlan = z.infer<typeof propertyRevenuePlanSchema>;
export type Loan = z.infer<typeof loanSchema>;
