import { z } from "zod";
import { dateString, monthString } from "../common.js";

export const revenueCategory = z.enum(["rent", "hotel_revenue", "other_revenue"]);

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
  contract_id: z
    .string()
    .regex(/^CTR-\d{3,}$/)
    .optional(),
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
