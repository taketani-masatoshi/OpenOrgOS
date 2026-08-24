import { z } from "zod";

/**
 * Cost / budget allocation axes (ID only — no L2 personal values).
 * Sum of amounts on a line must equal the parent line amount when present.
 */
export const costAllocationSliceSchema = z.object({
  business_unit_id: z.string().regex(/^BU-[A-Z0-9-]+$/),
  org_unit_id: z.string().min(1),
  /** Spender / cost consumer. Budget owner is derived via org-authority. */
  employee_id: z.string().regex(/^EMP-\d{3,}$/).optional(),
  amount: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const costAllocationArraySchema = z
  .array(costAllocationSliceSchema)
  .default([])
  .superRefine((allocations, ctx) => {
    if (allocations.length === 0) return;
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    if (!Number.isFinite(total) || total < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allocation amounts must be finite non-negative",
      });
    }
  });

export type CostAllocationSlice = z.output<typeof costAllocationSliceSchema>;
