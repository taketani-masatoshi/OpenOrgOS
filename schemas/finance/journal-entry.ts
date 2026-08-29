import { z } from "zod";
import { monthString } from "../common.js";

export const taxCategorySchema = z.enum([
  "taxable_10",
  "taxable_8",
  "exempt",
  "non_taxable",
  "out_of_scope",
  "tax_free",
]);

export const journalEntryLineSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  debit_yen: z.number().int().nonnegative().default(0),
  credit_yen: z.number().int().nonnegative().default(0),
  org_unit_id: z.string().min(1).optional(),
  person_id: z.string().min(1).optional(),
  counterparty_id: z.string().min(1).optional(),
  source_bank_account_id: z.string().min(1).optional(),
  tax_category: taxCategorySchema.optional(),
  tax_rate_pct: z.number().min(0).max(100).optional(),
});

const expenseClaimId = z.string().regex(/^ECL-\d{8}-\d{3}$/);

export const journalSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("expense_claim"),
    claim_id: expenseClaimId,
    event: z.enum(["expense_claim_posted", "expense_claim_reimbursed"]),
  }),
  z.object({
    kind: z.literal("depreciation"),
    asset_id: z.string().regex(/^ASSET-\d{3,}$/),
    period: monthString,
  }),
  z.object({
    kind: z.literal("payroll"),
    period: monthString,
  }),
  z.object({
    kind: z.literal("ar_ap"),
    ledger_entry_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("closing"),
    period: monthString,
    adjustment_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("manual"),
    authorized_by: z.string().min(1),
  }),
  z.object({
    kind: z.literal("remittance"),
    period: monthString,
    obligation: z.enum(["withholding", "social_insurance", "consumption_tax"]),
  }),
  z.object({
    kind: z.literal("consumption_tax_refund"),
    claim_id: z.string().regex(/^CLAIM-\d{4}-\d{2}-[a-z_]+$/),
    event: z.literal("refund_received"),
  }),
]);

export type JournalSource = z.output<typeof journalSourceSchema>;

function balanceRefine(
  entry: { lines: Array<{ debit_yen: number; credit_yen: number }> },
  ctx: z.RefinementCtx,
): void {
  const debit = entry.lines.reduce((sum, line) => sum + line.debit_yen, 0);
  const credit = entry.lines.reduce((sum, line) => sum + line.credit_yen, 0);
  if (debit !== credit || debit === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lines"],
      message: `journal entry must balance (debit=${debit}, credit=${credit})`,
    });
  }
  entry.lines.forEach((line, index) => {
    if (
      (line.debit_yen === 0 && line.credit_yen === 0) ||
      (line.debit_yen > 0 && line.credit_yen > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines", index],
        message: "journal line must contain exactly one debit or credit",
      });
    }
  });
}

export const journalEntrySchema = z
  .object({
    entry_id: z.string().regex(/^JE-[A-Z0-9-]+$/),
    occurred_at: z.string().datetime(),
    description: z.string().min(1),
    /** @deprecated use source.kind=expense_claim */
    claim_id: expenseClaimId.optional(),
    /** @deprecated use source.event */
    event: z
      .enum(["expense_claim_posted", "expense_claim_reimbursed"])
      .optional(),
    source: journalSourceSchema.optional(),
    posted_at: z.string().datetime().optional(),
    posted_by: z.string().min(1).optional(),
    reversal_of: z.string().regex(/^JE-[A-Z0-9-]+$/).optional(),
    evidence_refs: z.array(z.string().min(1)).min(1),
    lines: z.array(journalEntryLineSchema).min(2),
  })
  .superRefine((entry, ctx) => {
    balanceRefine(entry, ctx);
    const hasLegacy = entry.claim_id != null && entry.event != null;
    const hasSource = entry.source != null;
    if (!hasLegacy && !hasSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "journal entry requires source or legacy claim_id+event",
      });
    }
    if (hasLegacy && hasSource) {
      const legacySource = normalizeJournalSource(entry);
      if (JSON.stringify(legacySource) !== JSON.stringify(entry.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source"],
          message: "source conflicts with legacy claim_id/event",
        });
      }
    }
    const legacyOnly = hasLegacy && !hasSource;
    if (hasSource && !legacyOnly) {
      entry.lines.forEach((line, index) => {
        if (!line.tax_category) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lines", index, "tax_category"],
            message: "tax_category is required for source-based entries",
          });
        }
      });
    }
  });

export function normalizeJournalSource(entry: {
  claim_id?: string;
  event?: "expense_claim_posted" | "expense_claim_reimbursed";
  source?: JournalSource;
}): JournalSource | undefined {
  if (entry.source) return entry.source;
  if (entry.claim_id && entry.event) {
    return {
      kind: "expense_claim",
      claim_id: entry.claim_id,
      event: entry.event,
    };
  }
  return undefined;
}

export function normalizeJournalEntry<T extends z.input<typeof journalEntrySchema>>(
  entry: T,
): T & { source?: JournalSource } {
  const source = normalizeJournalSource(entry);
  if (!source) return entry;
  return { ...entry, source };
}

export const journalEntriesFileSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(journalEntrySchema).default([]),
});

export const expenseClaimAccountingSchema = z.object({
  version: z.literal(1).default(1),
  payable_account_code: z.string().regex(/^\d{4}$/),
  bank_control_accounts: z.record(
    z.string().min(1),
    z.string().regex(/^\d{4}$/),
  ),
});

export type JournalEntry = z.output<typeof journalEntrySchema>;
export type JournalEntriesFile = z.output<typeof journalEntriesFileSchema>;
export type ExpenseClaimAccounting = z.output<
  typeof expenseClaimAccountingSchema
>;
export type TaxCategory = z.output<typeof taxCategorySchema>;
