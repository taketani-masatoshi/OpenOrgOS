import { z } from "zod";

export const expenseClaimStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  /** @deprecated Prefer pending_reimbursement after monthly post. */
  "posted",
  "pending_reimbursement",
  "reimbursed",
  "rejected",
]);

export const expenseClaimGateSchema = z.enum([
  "allow_immediate",
  "needs_manager",
  "needs_rep_approval",
  "needs_late_exception",
  /** REG-004 B — dual representative directors. */
  "needs_ringi",
  /** REG-004 C — approved board evidence. */
  "needs_board",
  "blocked_dept_envelope",
  "blocked_company_envelope",
]);

export const expenseClaimIssuerRefSchema = z.object({
  /** OrgOS tenant_id when issuer is an OOO adopter; else external slug. */
  org_id: z.string().min(1),
  display_name: z.string().min(1).optional(),
  peer_id: z
    .string()
    .regex(/^PEER-\d{3}$/)
    .optional(),
  corporate_number: z
    .string()
    .regex(/^\d{13}$/)
    .optional(),
  /** Issuer invoice registration number (T + 13 digits). */
  invoice_registration_number: z
    .string()
    .regex(/^T\d{13}$/)
    .optional(),
  wire_ready: z.boolean().default(false),
});

export const expenseClaimReimbursementSchema = z.object({
  status: z.enum(["pending", "paid"]),
  requested_at: z.string().datetime().optional(),
  paid_at: z.string().datetime().optional(),
  paid_by: z.string().optional(),
  /** Broker transfer / payment instruction id — never bank account numbers. */
  payment_ref: z.string().min(1).optional(),
  broker_evidence_ref: z.string().min(1).optional(),
  /** External bank statement line/reference confirming settlement. */
  bank_statement_ref: z.string().min(1).optional(),
  /** External settlement evidence reference when no statement reference is used. */
  settlement_evidence_ref: z.string().min(1).optional(),
  amount_yen: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export const expenseClaimAllocationSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  amount_yen: z.number().int().positive(),
  org_unit_id: z.string().min(1),
  person_id: z.string().min(1).optional(),
  /** Optional zero-based receipt line mapping for deterministic category checks. */
  line_index: z.number().int().nonnegative().optional(),
  description: z.string().min(1).optional(),
});

export const expenseClaimInvoiceVerificationSchema = z.object({
  status: z.enum(["verified", "format_only"]),
  verified_as_of: z.string().date().optional(),
  source_ref: z.string().optional(),
  warning: z.string().optional(),
});

export const expenseClaimAccountSuggestionSchema = z.object({
  account_code: z.string().regex(/^\d{4}$/),
  confidence: z.literal("high"),
  reasons: z.array(z.string().min(1)).min(1),
});

export const expenseClaimSchema = z
  .object({
    claim_id: z.string().regex(/^ECL-\d{8}-\d{3}$/),
    status: expenseClaimStatusSchema,
    gate: expenseClaimGateSchema.optional(),
    person_id: z.string().min(1),
    org_unit_id: z.string().min(1),
    account_code: z.string().regex(/^\d{4}$/),
    amount_yen: z.number().int().positive(),
    /** Optional split; omitted claims use the top-level account/person/org unit. */
    allocations: z.array(expenseClaimAllocationSchema).min(1).optional(),
    currency: z.literal("JPY").default("JPY"),
    issuer: expenseClaimIssuerRefSchema,
    receipt_id: z.string().min(1),
    receipt_digest: z.string().min(1),
    /** Path relative to tenant data/ for verified snapshot JSON. */
    receipt_snapshot_path: z.string().optional(),
    /** Receipt recipient (REG-005: must match company legal name). */
    recipient_name: z.string().min(1).optional(),
    transaction_date: z.string().date().optional(),
    deadline_status: z.enum(["on_time", "late"]).optional(),
    days_after_transaction: z.number().int().nonnegative().optional(),
    account_suggestion: expenseClaimAccountSuggestionSchema.optional(),
    invoice_verification: expenseClaimInvoiceVerificationSchema.optional(),
    proposed_by: z.string().min(1),
    proposed_at: z.string().datetime(),
    approval_id: z.string().optional(),
    board_event_id: z
      .string()
      .regex(/^EVT-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    approved_by: z.string().optional(),
    approved_at: z.string().datetime().optional(),
    co_approved_by: z.string().optional(),
    rejected_by: z.string().optional(),
    rejected_at: z.string().datetime().optional(),
    reject_reason: z.string().optional(),
    monthly_ref: z
      .object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        note: z.string().optional(),
      })
      .optional(),
    posted_at: z.string().datetime().optional(),
    reimbursement: expenseClaimReimbursementSchema.optional(),
    journal_refs: z
      .object({
        posting_entry_id: z.string().min(1).optional(),
        reimbursement_entry_id: z.string().min(1).optional(),
      })
      .optional(),
    evidence_archive_ref: z.string().min(1).optional(),
    wire_claim_event_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    /**
     * Per-claim optimistic concurrency token (HTTP: expected_claim_revision).
     * Independent of file-level claims_revision so distinct claims can mutate
     * concurrently without false conflicts.
     */
    claim_revision: z.number().int().nonnegative().default(0),
  })
  .superRefine((claim, ctx) => {
    if (!claim.allocations?.length) return;
    const sum = claim.allocations.reduce(
      (total, allocation) => total + allocation.amount_yen,
      0,
    );
    if (sum !== claim.amount_yen) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: `allocations sum ${sum} must equal amount_yen ${claim.amount_yen}`,
      });
    }
  });

export const expenseClaimsFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: z.string().optional(),
  /** Monotonic optimistic-concurrency token (HTTP: expected_claims_revision). */
  claims_revision: z.number().int().nonnegative().default(0),
  claims: z.array(expenseClaimSchema).default([]),
});

export type ExpenseClaimStatus = z.output<typeof expenseClaimStatusSchema>;
export type ExpenseClaimGate = z.output<typeof expenseClaimGateSchema>;
export type ExpenseClaimIssuerRef = z.output<
  typeof expenseClaimIssuerRefSchema
>;
export type ExpenseClaimReimbursement = z.output<
  typeof expenseClaimReimbursementSchema
>;
export type ExpenseClaimAllocation = z.output<
  typeof expenseClaimAllocationSchema
>;
export type ExpenseClaim = z.output<typeof expenseClaimSchema>;
export type ExpenseClaimsFile = z.output<typeof expenseClaimsFileSchema>;

/** Department-head / CEO gate for personal envelope overage (≤¥100,000). */
export const EXPENSE_CLAIM_MANAGER_SUBJECT = "expense.claim.manager";
/** REG-004 A representative approval for an ordinary claimant. */
export const EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT =
  "expense.claim.representative";
/** REG-005 exception for claims submitted after 30 calendar days. */
export const EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT =
  "expense.claim.late_exception";
/** REG-004 ringi path for expenses over ¥100,000 (tier B/C). */
export const EXPENSE_CLAIM_RINGI_SUBJECT = "expense.claim.ringi";
/** REG-004 C board evidence path for expenses over ¥1,000,000. */
export const EXPENSE_CLAIM_BOARD_SUBJECT = "expense.claim.board";
