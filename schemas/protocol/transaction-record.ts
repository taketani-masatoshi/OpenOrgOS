import { z } from "zod";
import { orgRefSchema } from "./org-event.js";
import {
  committeeTransactionTypeSchema,
  legacyTransactionTypeSchema,
  normalizeTransactionType,
  type CommitteeTransactionType,
} from "./committee-transaction.js";

export {
  committeeTransactionTypeSchema,
  legacyTransactionTypeSchema,
  normalizeTransactionType,
  type CommitteeTransactionType,
  type LegacyTransactionType,
  LEGACY_TRANSACTION_TYPE_MAP,
  isContractExecutionNoticeType,
  isContractExecutedType,
} from "./committee-transaction.js";

/** Stored ledger rows — accept legacy types and normalize to committee namespace. */
export const storedTransactionTypeSchema = z
  .union([committeeTransactionTypeSchema, legacyTransactionTypeSchema])
  .transform((value) => normalizeTransactionType(value));

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

/** Accept legacy or committee types; stored form is always committee namespace. */
export const transactionTypeSchema = storedTransactionTypeSchema;

export const transactionRecordSchema = z.object({
  transaction_id: z.string().regex(/^TX-\d{8}-\d{3}$/),
  direction: z.enum(["outbound", "inbound"]),
  our_org: orgRefSchema,
  counterparty: orgRefSchema,
  transaction_type: storedTransactionTypeSchema,
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

export type TransactionType = CommitteeTransactionType;
export type TransactionRecord = z.output<typeof transactionRecordSchema>;
export type TransactionsRegistry = z.output<typeof transactionsRegistrySchema>;
