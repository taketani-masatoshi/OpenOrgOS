import { z } from "zod";

/**
 * Strict input validation for budget HTTP APIs.
 * Data plane is YAML (not SQL) — still reject injection-shaped IDs,
 * prototype pollution keys, stored XSS, and absurd amounts.
 */

const SAFE_ID = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/, "invalid id format");

const ACCOUNT_CODE = z
  .string()
  .trim()
  .regex(/^\d{3,6}$/, "account_code must be numeric");

const YEN = z.number().int().min(0).max(1_000_000_000_000_000);

const MONTH = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM")
  .optional();

const FISCAL_YEAR = z
  .string()
  .trim()
  .regex(/^FY\d{4}$/, "fiscal_year must be FYyyyy")
  .optional();

/** Strip tags / control chars from free text (defense-in-depth vs stored XSS). */
export function sanitizeBudgetText(input: string, maxLen = 500): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>`"']/g, "")
    .trim()
    .slice(0, maxLen);
}

const SAFE_TEXT = z
  .string()
  .max(2000)
  .transform((s) => sanitizeBudgetText(s))
  .optional();

function rejectPrototypePollution(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of Object.keys(value as object)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error("prototype pollution key rejected");
      }
    }
  }
  return value;
}

export const budgetMutationBodySchema = z.preprocess(
  rejectPrototypePollution,
  z
    .object({
      amount_yen: YEN.optional(),
      revenue_yen: YEN.optional(),
      opex_yen: YEN.optional(),
      expense_yen: YEN.optional(),
      capex_yen: YEN.optional(),
      org_unit_id: SAFE_ID.optional(),
      member_operator_id: SAFE_ID.optional(),
      person_id: SAFE_ID.optional(),
      account_code: ACCOUNT_CODE.optional(),
      fiscal_year: FISCAL_YEAR,
      purpose: SAFE_TEXT,
      reference: SAFE_TEXT,
      notes: SAFE_TEXT,
      board_event_id: SAFE_ID.optional(),
      month: MONTH,
      as_of_month: MONTH,
      publisher_operator_id: SAFE_ID.optional(),
      /** Optimistic concurrency: last known budget event_id (or "0"). */
      expected_revision: z
        .string()
        .trim()
        .regex(/^(0|BDE-\d{6})$/, "expected_revision must be 0 or BDE-######")
        .optional(),
      /** Expense-claims file token (decimal string) — ingest / append. */
      expected_claims_revision: z
        .string()
        .trim()
        .regex(/^\d+$/, "expected_claims_revision must be a non-negative integer")
        .optional(),
      /** Per-claim token (decimal string) — approve/reject/transfer/reimburse. */
      expected_claim_revision: z
        .string()
        .trim()
        .regex(/^\d+$/, "expected_claim_revision must be a non-negative integer")
        .optional(),
      /** Outlook last event_id (or "0"). */
      expected_outlook_revision: z
        .string()
        .trim()
        .regex(/^(0|OLE-\d{6})$/, "expected_outlook_revision must be 0 or OLE-######")
        .optional(),
    })
    .strict(),
);

export type BudgetMutationBody = z.infer<typeof budgetMutationBodySchema>;

export function parseBudgetMutationBody(raw: unknown): BudgetMutationBody {
  const parsed = budgetMutationBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(msg || "invalid budget request body");
  }
  return parsed.data;
}
