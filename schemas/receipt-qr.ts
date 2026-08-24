import { z } from "zod";

export const receiptDocumentTypeSchema = z.enum([
  "qualified_invoice",
  "qualified_simplified_invoice",
]);

export const receiptTaxRateSchema = z.union([
  z.literal(0),
  z.literal(8),
  z.literal(10),
]);

export const receiptLineSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.number().positive().optional(),
    tax_rate: receiptTaxRateSchema,
    reduced_tax: z.boolean().default(false),
    amount_excluding_tax: z.number().int().nonnegative(),
    tax_amount: z.number().int().nonnegative(),
    amount_including_tax: z.number().int().nonnegative(),
  })
  .superRefine((value, ctx) => {
    if (
      value.amount_excluding_tax + value.tax_amount !==
      value.amount_including_tax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount_including_tax"],
        message:
          "amount_including_tax must equal amount_excluding_tax + tax_amount",
      });
    }
  });

export const receiptTaxTotalSchema = z.object({
  tax_rate: receiptTaxRateSchema,
  amount_excluding_tax: z.number().int().nonnegative(),
  tax_amount: z.number().int().nonnegative(),
  amount_including_tax: z.number().int().nonnegative(),
});

const receiptClaimSchema = z.object({
  endpoint: z.string().url(),
  claim_key: z.string().min(32),
});

const receiptQrDataObjectSchema = z.object({
  schema: z.literal("orgos.jp.receipt.v1"),
  receipt_id: z.string().regex(/^RCPT-\d{8}-\d{3}$/),
  document_type: receiptDocumentTypeSchema,
  issued_at: z.string().datetime(),
  transaction_date: z.string().date(),
  currency: z.literal("JPY"),
  issuer: z.object({
    org_id: z.string().min(1),
    name: z.string().min(1),
    invoice_registration_number: z.string().regex(/^T\d{13}$/),
  }),
  recipient_name: z.string().min(1).optional(),
  lines: z.array(receiptLineSchema).min(1),
  tax_totals: z.array(receiptTaxTotalSchema).min(1),
  total_amount: z.number().int().nonnegative(),
  /** Present for OOO Wire claim; optional for Stage-1 ingest / non-OOO merchants. */
  claim: receiptClaimSchema.optional(),
  /** Optional fetch URL for signed receipt body (online share). */
  fetch_url: z.string().url().optional(),
});

export const receiptQrDataSchema = receiptQrDataObjectSchema.superRefine(
  (value, ctx) => {
    if (value.document_type === "qualified_invoice" && !value.recipient_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipient_name"],
        message: "qualified_invoice requires recipient_name",
      });
    }
    for (const [index, line] of value.lines.entries()) {
      if (line.reduced_tax && line.tax_rate !== 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lines", index, "reduced_tax"],
          message: "reduced_tax is only valid for the 8% rate",
        });
      }
    }
  },
);

export const signedReceiptQrPayloadSchema = z.object({
  receipt: receiptQrDataSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  issuer_public_key: z.string().min(1),
});

export const receiptClaimStatusSchema = z.enum([
  "unclaimed",
  "claim_pending_approval",
  "claimed",
  "claim_rejected",
  "void",
]);

export const storedReceiptSchema = z.object({
  receipt: receiptQrDataObjectSchema.omit({ claim: true, fetch_url: true }),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().min(1),
  issuer_public_key: z.string().min(1),
  claim_endpoint: z.string().url(),
  claim_key_hash: z.string().regex(/^[a-f0-9]{64}$/),
  claim_status: receiptClaimStatusSchema.default("unclaimed"),
  issued_event_id: z.string().uuid(),
  claimed_by_org_id: z.string().optional(),
  claimed_by_peer_id: z
    .string()
    .regex(/^PEER-\d{3}$/)
    .optional(),
  claim_requested_at: z.string().datetime().optional(),
  claim_approval_id: z
    .string()
    .regex(/^NOTICE-\d{8}-\d{3}$/)
    .optional(),
  claimed_event_id: z.string().uuid().optional(),
  claimed_at: z.string().datetime().optional(),
  claim_rejected_at: z.string().datetime().optional(),
  claim_reject_reason: z.string().min(1).optional(),
  claim_rejected_by: z.string().min(1).optional(),
});

export const receiptRegistrySchema = z.object({
  as_of: z.string().optional(),
  receipts: z.array(storedReceiptSchema).default([]),
});

export const receiptQrConfigSchema = z
  .object({
    schema: z.literal("orgos.jp.receipt.config.v1"),
    claim_base_url: z.string().url(),
    receipt_portal_url: z
      .string()
      .url()
      .default("https://receipt.oorgos.org/r"),
    simple_invoice_eligible: z.boolean(),
    simple_invoice_basis: z.string().min(1).optional(),
    tax_rounding: z.enum(["floor", "round", "ceil"]).default("floor"),
  })
  .superRefine((value, ctx) => {
    if (value.simple_invoice_eligible && !value.simple_invoice_basis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["simple_invoice_basis"],
        message:
          "eligible simplified-invoice issuers must record their business basis",
      });
    }
  });

export type ReceiptDocumentType = z.output<typeof receiptDocumentTypeSchema>;
export type ReceiptLine = z.output<typeof receiptLineSchema>;
export type ReceiptQrData = z.output<typeof receiptQrDataSchema>;
export type SignedReceiptQrPayload = z.output<
  typeof signedReceiptQrPayloadSchema
>;
export type StoredReceipt = z.output<typeof storedReceiptSchema>;
export type ReceiptRegistry = z.output<typeof receiptRegistrySchema>;
