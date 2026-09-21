import { z } from "zod";

/** Bases already collected by the consumption-tax summary. Not a return form. */
export const consumptionTaxReturnInputKeySchema = z.enum([
  "taxable_sales_10_yen",
  "taxable_sales_8_yen",
  "taxable_purchases_10_yen",
  "taxable_purchases_8_yen",
  "excess_adjustment_yen",
  "return_tax_yen",
  "bad_debt_yen",
  "interim_payment_yen",
]);

export const consumptionTaxReturnSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("input"), key: consumptionTaxReturnInputKeySchema }).strict(),
  z.object({ kind: z.literal("row"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("rows"), ids: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ kind: z.literal("purchase_lines") }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const consumptionTaxReturnTransformSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("identity") }).strict(),
  z.object({ op: z.literal("floor_unit"), unit_yen: z.number().int().positive() }).strict(),
  z
    .object({
      op: z.literal("inclusive_rollback_floor"),
      inclusive_numerator: z.union([z.literal(108), z.literal(110)]),
      inclusive_denominator: z.literal(100),
      rollback_numerator: z.literal(100),
      rollback_denominator: z.union([z.literal(108), z.literal(110)]),
      unit_yen: z.literal(1000),
    })
    .strict(),
  z
    .object({
      op: z.literal("rate_floor"),
      numerator: z.number().int().positive(),
      denominator: z.number().int().positive(),
    })
    .strict(),
  z.object({ op: z.literal("sum") }).strict(),
  z.object({ op: z.literal("subtract") }).strict(),
  z
    .object({
      op: z.literal("floor_if_nonnegative"),
      unit_yen: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      op: z.literal("signed_rate_then_payable_floor"),
      numerator: z.number().int().positive(),
      denominator: z.number().int().positive(),
      payable_unit_yen: z.number().int().positive(),
    })
    .strict(),
  z.object({ op: z.literal("purchase_credit") }).strict(),
  z.object({ op: z.literal("out_of_scope") }).strict(),
]);

export const consumptionTaxReturnMapRowSchema = z
  .object({
    id: z.string().min(1),
    sheet: z.enum([
      "return_page2",
      "return_page1",
      "schedule_1_3",
      "schedule_2_3",
      "internal",
      "excluded",
    ]),
    line: z.string().min(1),
    label_ja: z.string().min(1),
    required: z.boolean(),
    source: consumptionTaxReturnSourceSchema,
    transform: consumptionTaxReturnTransformSchema,
  })
  .strict();

const positiveRateSchema = z
  .object({
    numerator: z.number().int().positive(),
    denominator: z.number().int().positive(),
  })
  .strict();

export const consumptionTaxReturnMapSchema = z
  .object({
    id: z.string().min(1),
    form: z.string().min(1),
    source_label: z.string().min(1),
    submission: z.literal("not-for-etax"),
    disclaimer: z.string().min(1),
    national_rates: z
      .object({
        taxable_10: positiveRateSchema,
        taxable_8: positiveRateSchema,
      })
      .strict(),
    full_purchase_credit: z
      .object({
        min_ratio_bp: z.number().int().positive(),
        max_taxable_sales_yen: z.number().int().positive(),
      })
      .strict(),
    transitional_nonqualified: z
      .array(
        z
          .object({
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            numerator: z.number().int().positive(),
            denominator: z.number().int().positive(),
            invoice_status: z.enum(["nonqualified_80", "nonqualified_70", "nonqualified_50"]),
          })
          .strict()
      )
      .min(1),
    rows: z.array(consumptionTaxReturnMapRowSchema).min(1),
  })
  .strict()
  .superRefine((mapping, ctx) => {
    if (!mapping.disclaimer.includes("提出しない") || !mapping.disclaimer.includes("e-Tax")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["disclaimer"],
        message: "disclaimer must say the rows are not an e-Tax filing",
      });
    }
    const ids = new Set<string>();
    for (const row of mapping.rows) {
      if (ids.has(row.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows"],
          message: `duplicate row id ${row.id}`,
        });
      }
      ids.add(row.id);
    }
    for (const row of mapping.rows) {
      assertRowShape(row, ids, ctx);
    }
    if (hasCycle(mapping.rows)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: "row sources contain a cycle",
      });
    }
  });

function dependencyIds(row: ConsumptionTaxReturnMapRow): string[] {
  if (row.source.kind === "row") return [row.source.id];
  if (row.source.kind === "rows") return row.source.ids;
  return [];
}

function assertRowShape(
  row: ConsumptionTaxReturnMapRow,
  ids: Set<string>,
  ctx: z.RefinementCtx
): void {
  for (const id of dependencyIds(row)) {
    if (!ids.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `${row.id} references missing row ${id}`,
      });
    }
  }
  if (row.transform.op === "inclusive_rollback_floor") {
    if (row.source.kind !== "input") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `${row.id} rolls a tax-exclusive input back to inclusive once`,
      });
    }
    if (row.transform.rollback_denominator !== row.transform.inclusive_numerator) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `${row.id} must not apply the rollback ratio twice`,
      });
    }
  }
  if (row.transform.op === "purchase_credit" && row.source.kind !== "purchase_lines") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} purchase credit reads purchase lines`,
    });
  }
  if (row.source.kind === "purchase_lines" && row.transform.op !== "purchase_credit") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} purchase lines only feed purchase credit`,
    });
  }
  if (row.transform.op === "out_of_scope") {
    if (row.required || row.source.kind !== "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows"],
        message: `${row.id} is out of scope and cannot be required`,
      });
    }
    return;
  }
  if (row.source.kind === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} has no source`,
    });
  }
  const single =
    row.transform.op === "identity" ||
    row.transform.op === "floor_unit" ||
    row.transform.op === "rate_floor" ||
    row.transform.op === "floor_if_nonnegative" ||
    row.transform.op === "signed_rate_then_payable_floor";
  if (single && row.source.kind !== "input" && row.source.kind !== "row") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} transform ${row.transform.op} needs one source`,
    });
  }
  if (row.transform.op === "sum" && row.source.kind !== "rows") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} sum needs row sources`,
    });
  }
  if (
    row.transform.op === "subtract" &&
    !(row.source.kind === "rows" && row.source.ids.length === 2)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: `${row.id} subtract needs exactly two row sources`,
    });
  }
}

function hasCycle(rows: ConsumptionTaxReturnMapRow[]): boolean {
  const pending = new Set(rows.map((row) => row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  while (pending.size > 0) {
    const ready = [...pending].filter((id) =>
      dependencyIds(byId.get(id)!).every((dep) => !pending.has(dep))
    );
    if (ready.length === 0) return true;
    for (const id of ready) pending.delete(id);
  }
  return false;
}

export const consumptionTaxReturnRowSchema = z
  .object({
    id: z.string().min(1),
    sheet: consumptionTaxReturnMapRowSchema.shape.sheet,
    line: z.string().min(1),
    label_ja: z.string().min(1),
    required: z.boolean(),
    row_status: z.enum(["filled", "blocked", "out_of_scope"]),
    amount_yen: z.number().int().nullable(),
  })
  .strict();

export const consumptionTaxReturnRowsSchema = z
  .object({
    submission: z.literal("not-for-etax"),
    status: z.enum(["ready_for_advisor_review", "blocked"]),
    fiscal_year: z
      .string()
      .regex(/^FY\d{4}$/)
      .optional(),
    form: z.string().min(1),
    source_label: z.string().min(1),
    disclaimer: z.string().min(1),
    blockers: z.array(z.string()),
    rows: z.array(consumptionTaxReturnRowSchema),
  })
  .strict();

export type ConsumptionTaxReturnInputKey = z.infer<typeof consumptionTaxReturnInputKeySchema>;
export type ConsumptionTaxReturnMap = z.infer<typeof consumptionTaxReturnMapSchema>;
export type ConsumptionTaxReturnMapRow = z.infer<typeof consumptionTaxReturnMapRowSchema>;
export type ConsumptionTaxReturnRows = z.infer<typeof consumptionTaxReturnRowsSchema>;
