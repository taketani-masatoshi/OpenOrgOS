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

export const statementSectionSchema = z.enum([
  "revenue",
  "cogs",
  "sga",
  "non_operating_income",
  "non_operating_expense",
  "extraordinary_gain",
  "extraordinary",
  "income_tax",
]);

export const chartAccountSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  name: z.string().min(1),
  type: z.string().min(1),
  normal_balance: z.enum(["debit", "credit"]),
  /** P/L statement line grouping for GL-derived kessan PDF. */
  statement_section: statementSectionSchema.optional(),
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
  /** Current/noncurrent for the balance sheet. Code thresholds are not a substitute. */
  bs_class: z.enum(["current", "noncurrent"]).optional(),
  /** Equity statement column. Retained earnings may also be inferred from journal_source_accounts. */
  equity_class: z.enum(["capital", "capital_surplus", "retained"]).optional(),
  /** Posted legal reserve. Absent means the reserve balance is zero. */
  statutory_role: z.enum(["legal_reserve"]).optional(),
  /** Cash-flow role. Prefix matching is not a substitute. */
  cf_role: z
    .enum(["cash", "receivable", "payable", "fixed_asset", "loan", "equity"])
    .optional(),
});

export type StatementSection = z.output<typeof statementSectionSchema>;
export type BudgetDelegationScope = z.output<typeof budgetDelegationScopeSchema>;
export type BudgetMutability = z.output<typeof budgetMutabilitySchema>;

export const journalSourceAccountsSchema = z.object({
  bank_control: z.string().regex(/^\d{4}$/),
  accounts_receivable: z.string().regex(/^\d{4}$/),
  withholding_payable: z.string().regex(/^\d{4}$/),
  social_insurance_payable: z.string().regex(/^\d{4}$/),
  payroll_payable: z.string().regex(/^\d{4}$/),
  accounts_payable: z.string().regex(/^\d{4}$/).optional(),
  payroll_expense: z.string().regex(/^\d{4}$/),
  depreciation_expense: z.string().regex(/^\d{4}$/),
  accumulated_depreciation: z.string().regex(/^\d{4}$/),
  retained_earnings: z.string().regex(/^\d{4}$/),
  /** Sole-prop capital. Must not replace retained_earnings. */
  owner_capital: z.string().regex(/^\d{4}$/).optional(),
  owner_drawings: z.string().regex(/^\d{4}$/).optional(),
  owner_advances: z.string().regex(/^\d{4}$/).optional(),
  /** Year's income on the blue-return balance sheet. Not 元入金. */
  owner_income: z.string().regex(/^\d{4}$/).optional(),
  consumption_tax_payable: z.string().regex(/^\d{4}$/).optional(),
  consumption_tax_receivable: z.string().regex(/^\d{4}$/).optional(),
  lodging_tax_payable: z.string().regex(/^\d{4}$/).optional(),
});

export const chartOfAccountsSchema = z.object({
  version: z.string().optional(),
  currency: z.enum(["JPY", "USD", "EUR", "SGD", "GBP", "HKD", "AUD", "TWD", "MYR", "CNY", "AED", "RUB"]).default("JPY"),
  accounts: z.array(chartAccountSchema).min(1),
  category_mapping: z.object({
    revenue: z.record(revenueCategory, z.string()),
    expense: z.record(expenseCategory, z.string()),
  }),
  journal_source_accounts: journalSourceAccountsSchema.optional(),
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
