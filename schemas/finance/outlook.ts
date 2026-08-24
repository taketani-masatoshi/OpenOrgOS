import { z } from "zod";
import { monthString } from "../common.js";
import { yojitsuLineKind } from "./yojitsu.js";

export const outlookLineSchema = z.object({
  segment: z.string().min(1),
  kind: yojitsuLineKind,
  amount: z.number().nonnegative(),
  account_code: z.string().optional(),
  org_unit_id: z.string().optional(),
  person_id: z.string().optional(),
  label: z.string().optional(),
});

export const outlookMonthSchema = z.object({
  month: monthString,
  lines: z.array(outlookLineSchema).default([]),
  notes: z.string().optional(),
});

/** Accept legacy `expense_yen` and normalize to `opex_yen`. */
export const outlookDepartmentSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const row = raw as Record<string, unknown>;
    if (row.opex_yen == null && typeof row.expense_yen === "number") {
      const { expense_yen, ...rest } = row;
      return { ...rest, opex_yen: expense_yen };
    }
    return raw;
  },
  z.object({
    org_unit_id: z.string().min(1),
    /** Department OPEX outlook (not CAPEX). */
    opex_yen: z.number().nonnegative(),
    revenue_yen: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  }),
);

export const outlookEventSchema = z.object({
  /** Optimistic concurrency token (HTTP: expected_outlook_revision). */
  event_id: z
    .string()
    .regex(/^OLE-\d{6}$/)
    .optional(),
  at: z.string().min(1),
  type: z.enum([
    "init",
    "set_remaining",
    "set_as_of",
    "publish",
    "sync_yojitsu",
    "set_department",
    "propose_envelope",
  ]),
  actor_operator_id: z.string().optional(),
  detail: z.string().optional(),
});

export const midYearOutlookSchema = z.object({
  fiscal_year: z.string().regex(/^FY\d{4}$/),
  as_of_month: monthString,
  status: z.enum(["draft", "published"]).default("draft"),
  currency: z.string().default("JPY"),
  method: z
    .literal("ytd_actual_plus_remaining")
    .default("ytd_actual_plus_remaining"),
  /**
   * Amount basis note (MAL: revenue often tax-exclusive in yojitsu;
   * monthly expenses mix tax-inclusive OPEX and CAPEX).
   */
  amount_basis_notes: z.string().optional(),
  notes: z.string().optional(),
  remaining_months: z.array(outlookMonthSchema).default([]),
  department_outlook: z.array(outlookDepartmentSchema).default([]),
  /** Last editor — publish must use a different operator (ADR 0029). */
  last_edited_by_operator_id: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  published_by_operator_id: z.string().nullable().optional(),
  events: z.array(outlookEventSchema).default([]),
});

export type MidYearOutlookFile = z.infer<typeof midYearOutlookSchema>;
export type OutlookLine = z.infer<typeof outlookLineSchema>;
export type OutlookMonth = z.infer<typeof outlookMonthSchema>;
export type OutlookDepartment = z.infer<typeof outlookDepartmentSchema>;
