import { z } from "zod";
import { dateString, monthString } from "../common.js";

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
  "travel",
  "meeting",
  "office_supplies",
  "insurance",
  "advisory",
  "system",
  "loan_payment",
  /**
   * Capital expenditure — balance-sheet / investing CF, NOT period P/L expense.
   * Do not fold into OPEX or “net income”; use depreciation for P/L recognition.
   */
  "capex",
  /** Non-cash depreciation (P/L expense; excluded from OPEX / envelope / cash outflow). */
  "depreciation",
  /**
   * Officer compensation / wages (payroll SSOT).
   * Maps to company-scoped CoA (e.g. 5300) — not personal expense envelopes.
   */
  "payroll",
  "other",
]);

export const revenueEntry = z.object({
  property_id: z.string().optional(),
  category: revenueCategory,
  amount: z.number(),
  notes: z.string().optional(),
});

export const expenseEntry = z
  .object({
    property_id: z.string().optional(),
    category: expenseCategory,
    /** Explicit account wins over category_mapping when collecting budget actuals. */
    chart_account_code: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    amount: z.number(),
    /** Optional BU / org / employee allocation of this actual expense. */
    allocations: z
      .array(
        z.object({
          business_unit_id: z.string().regex(/^BU-[A-Z0-9-]+$/),
          org_unit_id: z.string().min(1),
          employee_id: z
            .string()
            .regex(/^EMP-\d{3,}$/)
            .optional(),
          amount: z.number().nonnegative(),
          notes: z.string().optional(),
        }),
      )
      .optional(),
    notes: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.allocations?.length) return;
    const sum = entry.allocations.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(sum - Math.abs(entry.amount)) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `allocations sum ${sum} must equal expense amount ${entry.amount}`,
        path: ["allocations"],
      });
    }
  });

export const monthlyFinanceSchema = z.object({
  month: monthString,
  /** actual = verified books; provisional/forecast must not count as actual variance */
  basis: z.enum(["actual", "provisional", "forecast"]).default("actual"),
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

export const loanTrancheSchema = z.object({
  id: z.string().regex(/^TRANCHE-\d{3,}$/),
  amount: z.number().positive(),
  executed_date: dateString.optional(),
  use_of_funds: z.string().min(1),
  documentation_status: z.enum(["verified", "pending"]),
  notes: z.string().optional(),
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
  tranches: z.array(loanTrancheSchema).optional(),
  fixed_asset_ids: z.array(z.string().regex(/^ASSET-\d{3,}$/)).optional(),
  account_code_liability: z.string().optional(),
  tax_notes: z.string().optional(),
  notes: z.string().optional(),
});

export const loansSchema = z.object({
  loans: z.array(loanSchema).default([]),
});

export const businessPlanYearStatus = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "superseded",
]);

export const businessPlanYear = z.object({
  year: z.number().int(),
  /** Canonical FY label when present (e.g. FY2027). Derived from year + fiscal calendar when omitted. */
  fiscal_year: z
    .string()
    .regex(/^FY\d{4}$/)
    .optional(),
  status: businessPlanYearStatus.default("draft"),
  approval_id: z.string().optional(),
  approved_at: z.string().optional(),
  approved_by: z.string().optional(),
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
  /** Organization mission (why we exist) — set at tenant init, refined by humans. */
  mission: z.string().optional(),
  /** Mid/long-term vision — set at tenant init, refined by humans. */
  vision: z.string().optional(),
  /** Core values (optional short list). */
  values: z.array(z.string().min(1)).default([]),
  mid_term_goals: z.array(z.string()).default([]),
  segments: z.array(businessSegment).default([]),
  kpi: z.array(kpiItem).default([]),
  years: z.array(businessPlanYear).default([]),
  funding_plan: z.string().optional(),
  /** Rolling base fiscal year for 1/3/5-year horizon views (e.g. FY2026). */
  horizon_base_fy: z
    .string()
    .regex(/^FY\d{4}$/)
    .optional(),
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
        /** Link to employees.yaml / monthly allocations (EMP-…). */
        employee_id: z
          .string()
          .regex(/^EMP-\d{3,}$/)
          .optional(),
        monthly: z.number().nonnegative().optional(),
        annual: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  /** Active employee cash payroll (excludes unpaid officers). */
  employee_payroll: z
    .object({
      monthly_gross_jpy: z.number().nonnegative(),
      has_withholding: z.boolean().default(true),
      has_social_insurance: z.boolean().default(true),
      /** Special-collection resident tax (monthly employer remittance). */
      resident_tax_special_jpy: z.number().nonnegative().optional(),
      employee_ids: z.array(z.string()).optional(),
      /**
       * Payroll months (YYYY-MM) with known unpaid withholding remittance.
       * Calendar marks these as known_unpaid (warning), not actionable overdue.
       */
      known_unpaid_withholding_months: z
        .array(z.string().regex(/^\d{4}-\d{2}$/))
        .optional(),
    })
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
