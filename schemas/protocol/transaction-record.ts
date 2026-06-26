import { z } from "zod";
import { orgRefSchema } from "./org-event.js";

export const transactionTypeSchema = z.enum([
  "contract.executed",
  "contract.amended",
  "contract.execution.notice",
  "invoice.issued",
  "payment.instructed",
  "obligation.acknowledged",
]);

export const transactionAmountSchema = z.object({
  value: z.number(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const transactionRefsSchema = z.object({
  contract_id: z.string().optional(),
  invoice_id: z.string().optional(),
  stakeholder_id: z.string().optional(),
  broker_instruction: z.string().optional(),
});

export const transactionRecordSchema = z.object({
  transaction_id: z.string().regex(/^TX-\d{8}-\d{3}$/),
  direction: z.enum(["outbound", "inbound"]),
  our_org: orgRefSchema,
  counterparty: orgRefSchema,
  transaction_type: transactionTypeSchema,
  amount: transactionAmountSchema.optional(),
  refs: transactionRefsSchema,
  event_id: z.string().uuid(),
  recorded_at: z.string().min(1),
  notes: z.string().optional(),
});

export const transactionsRegistrySchema = z.object({
  as_of: z.string().optional(),
  transactions: z.array(transactionRecordSchema).default([]),
});

export type TransactionType = z.output<typeof transactionTypeSchema>;
export type TransactionRecord = z.output<typeof transactionRecordSchema>;
export type TransactionsRegistry = z.output<typeof transactionsRegistrySchema>;
