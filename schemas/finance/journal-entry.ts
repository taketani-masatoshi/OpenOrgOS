import { z } from "zod";

export const journalEntryLineSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  debit_yen: z.number().int().nonnegative().default(0),
  credit_yen: z.number().int().nonnegative().default(0),
  org_unit_id: z.string().min(1).optional(),
  person_id: z.string().min(1).optional(),
  source_bank_account_id: z.string().min(1).optional(),
});

export const journalEntrySchema = z
  .object({
    entry_id: z.string().regex(/^JE-[A-Z0-9-]+$/),
    occurred_at: z.string().datetime(),
    description: z.string().min(1),
    claim_id: z.string().regex(/^ECL-\d{8}-\d{3}$/),
    event: z.enum(["expense_claim_posted", "expense_claim_reimbursed"]),
    evidence_refs: z.array(z.string().min(1)).min(1),
    lines: z.array(journalEntryLineSchema).min(2),
  })
  .superRefine((entry, ctx) => {
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
  });

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
