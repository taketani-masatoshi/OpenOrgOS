import { z } from "zod";
import { dateString, monthString } from "./common.js";
import { loanDocumentsSchema } from "./finance.js";

export const planLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  property_id: z.string().optional(),
  contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
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

export const debtRepaymentEntrySchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  loan_id: z.string().regex(/^LOAN-\d{3,}$/),
  principal: z.number().nonnegative(),
  balance_after: z.number().nonnegative().optional(),
  status: z.enum(["confirmed", "planned", "tbd"]).default("planned"),
  notes: z.string().optional(),
});

export const debtScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  repayments: z.array(debtRepaymentEntrySchema).default([]),
});

export const debtPlanLoanSchema = z.object({
  loan_id: z.string().regex(/^LOAN-\d{3,}$/),
  contract_id: z.string().regex(/^CTR-\d{3,}$/),
  property_id: z.string().optional(),
  property_name: z.string().optional(),
  lender: z.string().optional(),
  balance: z.number().nonnegative(),
  interest_rate: z.number().min(0),
  executed_date: dateString.optional(),
  maturity_date: dateString,
  repayment_start: z.string().optional(),
  use_of_funds: z
    .object({
      land: z.number().nonnegative().optional(),
      construction: z.number().nonnegative().optional(),
    })
    .optional(),
  documents: loanDocumentsSchema.optional(),
  notes: z.string().optional(),
});

export const debtAnnualScheduleRowSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  loan_001: z.number().nonnegative(),
  loan_002: z.number().nonnegative(),
  total_repayment: z.number().nonnegative(),
  total_balance: z.number().nonnegative(),
  milestone: z.string().optional(),
});

export const debtDscrProjectionSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  scenario_id: z.string().min(1),
  noi_proxy: z.number().optional(),
  debt_service: z.number().nonnegative(),
  dscr: z.number().nullable().optional(),
  status: z.enum(["ok", "warning", "critical", "n_a"]).optional(),
  notes: z.string().optional(),
});

export const debtPlanSchema = z.object({
  currency: z.literal("JPY").default("JPY"),
  as_of: dateString.optional(),
  status: z.enum(["draft", "active", "superseded"]).default("draft"),
  summary: z.object({
    total_debt: z.number().nonnegative(),
    loan_count: z.number().int().positive(),
    interest_bearing_debt: z.number().nonnegative().default(0),
    bank_borrowing: z.number().nonnegative().default(0),
    notes: z.string().optional(),
  }),
  policies: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .default([]),
  loans: z.array(debtPlanLoanSchema).min(1),
  future_bank_borrowing: z.object({
    planned: z.boolean(),
    amount: z.number().nonnegative().default(0),
    notes: z.string().optional(),
  }),
  scenarios: z.array(debtScenarioSchema).min(1),
  annual_schedule: z
    .object({
      description: z.string().optional(),
      rows: z.array(debtAnnualScheduleRowSchema).default([]),
    })
    .optional(),
  dscr: z.object({
    targets: z.object({
      minimum: z.number().positive(),
      warning: z.number().positive(),
      notes: z.string().optional(),
    }),
    assumptions: z.string().optional(),
    projections: z.array(debtDscrProjectionSchema).default([]),
  }),
  documents: z
    .object({
      borrowing: z.string().optional(),
      repayment: z.string().optional(),
      dscr: z.string().optional(),
      source_loans: z.string().optional(),
      source_business_plan: z.string().optional(),
    })
    .optional(),
  tbd: z
    .array(
      z.object({
        item: z.string().min(1),
        status: z.string().min(1),
        owner: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .default([]),
  notes: z.string().optional(),
});

export type RevenuePlan = z.infer<typeof revenuePlanSchema>;
export type ProfitPlan = z.infer<typeof profitPlanSchema>;
export type ExpensePlan = z.infer<typeof expensePlanSchema>;
export type InvestmentPlan = z.infer<typeof investmentPlanSchema>;
export type DebtPlan = z.infer<typeof debtPlanSchema>;
