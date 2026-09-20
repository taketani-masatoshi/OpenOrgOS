import { z } from "zod";

const filingScheduleSchema = z.object({
  id: z.enum(["rate-summary", "purchase-credit", "taxable-sales-ratio", "interim-payments", "annual-adjustments", "advisor-review"]),
  complete: z.boolean(),
});

export const consumptionTaxFilingDraftSchema = z
  .object({
    fiscal_year: z.string().regex(/^FY\d{4}$/),
    submission: z.literal("not-for-etax"),
    status: z.enum(["ready_for_advisor_review", "blocked"]),
    policy_id: z.string().min(1),
    calculation_method: z.enum(["standard", "simplified", "two_tenths"]),
    output_tax_yen: z.number().int().nonnegative(),
    deductible_input_tax_yen: z.number().int().nonnegative(),
    net_tax_yen: z.number().int(),
    taxable_base_10_yen: z.number().int().nonnegative(),
    taxable_base_8_yen: z.number().int().nonnegative(),
    national_output_tax_yen: z.number().int().nonnegative(),
    national_input_tax_yen: z.number().int().nonnegative(),
    national_tax_yen: z.number().int(),
    local_consumption_tax_yen: z.number().int(),
    combined_tax_yen: z.number().int(),
    remitted_yen: z.number().int().nonnegative(),
    remaining_yen: z.number().int(),
    taxable_sales_ratio_pct: z.number().min(0).max(100),
    input_tax_adjustment_yen: z.number().int().default(0),
    annual_adjustments: z.array(z.object({
      kind: z.enum(["fixed_asset_ratio", "inventory"]),
      reference: z.string().min(1),
      amount_yen: z.number().int(),
    })).default([]),
    schedules: z.array(filingScheduleSchema),
    blockers: z.array(z.string()),
    warnings: z.array(z.string()),
    advisor_review: z.object({
      status: z.enum(["pending", "approved", "rejected"]),
      reviewer_ref: z.string().optional(),
      reviewed_at: z.string().datetime().optional(),
      evidence_ref: z.string().optional(),
    }),
    interim_reconciliation: z.object({
      expected_frequency: z.enum(["none", "annual_1", "annual_3", "annual_11"]),
      configured_frequency: z.enum(["none", "annual_1", "annual_3", "annual_11"]),
      expected_count: z.number().int().nonnegative(),
      paid_count: z.number().int().nonnegative(),
      expected_yen: z.number().int().nonnegative(),
      paid_yen: z.number().int().nonnegative(),
      periods: z.array(z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expected_yen: z.number().int().nonnegative(),
        paid_yen: z.number().int().nonnegative(),
        status: z.enum(["unpaid", "partial", "paid", "overpaid"]),
      })),
    }),
  })
  .superRefine((draft, ctx) => {
    if (draft.taxable_base_10_yen % 1_000 !== 0 || draft.taxable_base_8_yen % 1_000 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxable_base_10_yen"], message: "taxable bases must be rounded down to 1,000 yen units" });
    }
    if (draft.national_tax_yen > 0 && draft.national_tax_yen % 100 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["national_tax_yen"], message: "national payable tax must be in 100 yen units" });
    }
    if (draft.local_consumption_tax_yen > 0 && draft.local_consumption_tax_yen % 100 !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["local_consumption_tax_yen"], message: "local payable tax must be in 100 yen units" });
    }
    if (draft.combined_tax_yen !== draft.national_tax_yen + draft.local_consumption_tax_yen) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["combined_tax_yen"], message: "combined tax does not reconcile" });
    }
    if (draft.net_tax_yen !== draft.combined_tax_yen) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["net_tax_yen"], message: "net tax does not equal combined tax" });
    }
    if (draft.remaining_yen !== draft.combined_tax_yen - draft.remitted_yen) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["remaining_yen"], message: "remaining tax does not reconcile" });
    }
    if ((draft.blockers.length === 0) !== (draft.status === "ready_for_advisor_review")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "status and blockers do not agree" });
    }
  });

export type ConsumptionTaxFilingDraft = z.output<typeof consumptionTaxFilingDraftSchema>;
