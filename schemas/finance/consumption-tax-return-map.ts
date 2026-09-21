import { z } from "zod";

/** Bases already collected by the consumption-tax summary. Not a return form. */
export const consumptionTaxReturnInputKeySchema = z.enum([
  "taxable_sales_10_yen",
  "taxable_sales_8_yen",
  "taxable_purchases_10_yen",
  "taxable_purchases_8_yen",
]);

export const consumptionTaxReturnSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("input"), key: consumptionTaxReturnInputKeySchema }).strict(),
  z.object({ kind: z.literal("row"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("rows"), ids: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const consumptionTaxReturnTransformSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("identity") }).strict(),
  z.object({ op: z.literal("floor_unit"), unit_yen: z.number().int().positive() }).strict(),
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
  z.object({ op: z.literal("out_of_scope") }).strict(),
]);

export const consumptionTaxReturnMapRowSchema = z
  .object({
    id: z.string().min(1),
    sheet: z.enum(["return_page2", "return_page1", "schedule_1_3", "schedule_2_3", "excluded"]),
    line: z.string().min(1),
    label_ja: z.string().min(1),
    required: z.boolean(),
    source: consumptionTaxReturnSourceSchema,
    transform: consumptionTaxReturnTransformSchema,
  })
  .strict();

export const consumptionTaxReturnMapSchema = z
  .object({
    id: z.string().min(1),
    form: z.string().min(1),
    source_label: z.string().min(1),
    submission: z.literal("not-for-etax"),
    disclaimer: z.string().min(1),
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
