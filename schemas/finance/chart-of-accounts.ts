import { z } from "zod";
import { revenueCategory, expenseCategory } from "./monthly-loans.js";

/**
 * Hierarchical budget delegation scope for expense accounts.
 * - company: not distributed to persons (plan/derived or company envelope)
 * - department: company → department envelopes; not person-allocatable
 * - person: CEO / department head may allocate to individuals
 * Non-expense accounts ignore this field.
 */
export const budgetDelegationScopeSchema = z.enum([
  "company",
  "department",
  "person",
]);

/**
 * How the expense amount is authored (SSOT).
 * - derived: computed from fixed assets / loans / accounting rules (e.g. 減価償却)
 * - planned: set in expense-plan / payroll / annual planning — not mid-year UI edits
 * - allocatable: envelopes edited via budget-delegations (department / person distribution)
 */
export const budgetMutabilitySchema = z.enum([
  "derived",
  "planned",
  "allocatable",
]);

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
  /** Expense accounts only. Default department when omitted. */
  budget_delegation: budgetDelegationScopeSchema.default("department"),
  /**
   * Expense accounts only. When omitted:
   * person/department → allocatable; company → planned.
   */
  budget_mutability: budgetMutabilitySchema.optional(),
  note: z.string().optional(),
});

export type BudgetDelegationScope = z.output<typeof budgetDelegationScopeSchema>;
export type BudgetMutability = z.output<typeof budgetMutabilitySchema>;

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
