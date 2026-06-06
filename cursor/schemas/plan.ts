import { z } from "zod";
import { monthString } from "./common.js";

export const planLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  property_id: z.string().optional(),
  amount: z.number(),
  notes: z.string().optional(),
});

export const fiscalYearPlanSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  period_from: monthString,
  period_to: monthString,
  lines: z.array(planLineSchema).min(1),
  total: z.number(),
  notes: z.string().optional(),
});

export const revenuePlanSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  years: z.array(fiscalYearPlanSchema).min(1),
});

export const profitYearSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  period_from: monthString,
  period_to: monthString,
  revenue: z.number(),
  gross_profit: z.number(),
  sga: z.number(),
  operating_profit: z.number(),
  non_operating_net: z.number().default(0),
  pretax_profit: z.number(),
  tax: z.number().nonnegative().optional(),
  net_profit: z.number().optional(),
  status: z.enum(["plan", "closed"]).default("plan"),
  notes: z.string().optional(),
});

export const profitPlanSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  years: z.array(profitYearSchema).min(1),
});

export const expenseYearSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  period_from: monthString,
  period_to: monthString,
  lines: z.array(planLineSchema).min(1),
  total: z.number(),
  notes: z.string().optional(),
});

export const expensePlanSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  years: z.array(expenseYearSchema).min(1),
});

export const investmentItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  property_id: z.string().optional(),
  amount: z.number().nonnegative(),
  month: monthString.optional(),
  notes: z.string().optional(),
});

export const investmentYearSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  period_from: monthString,
  period_to: monthString,
  items: z.array(investmentItemSchema).default([]),
  total: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const investmentPlanSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  years: z.array(investmentYearSchema).min(1),
});

export type RevenuePlan = z.infer<typeof revenuePlanSchema>;
export type ProfitPlan = z.infer<typeof profitPlanSchema>;
export type ExpensePlan = z.infer<typeof expensePlanSchema>;
export type InvestmentPlan = z.infer<typeof investmentPlanSchema>;
