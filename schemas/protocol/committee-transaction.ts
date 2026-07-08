import { z } from "zod";

/** Steward committee payload namespace — domain semantics, not Core wire primitives. */
export const committeeTransactionTypeSchema = z.enum([
  "steward.contract.executed",
  "steward.contract.amended",
  "steward.contract.execution.notice",
  "steward.contract.void.requested",
  "steward.contract.void.acknowledged",
  "steward.invoice.issued",
  "steward.payment.instructed",
  "steward.obligation.acknowledged",
]);

export type CommitteeTransactionType = z.output<typeof committeeTransactionTypeSchema>;

export const LEGACY_TRANSACTION_TYPE_MAP = {
  "contract.executed": "steward.contract.executed",
  "contract.amended": "steward.contract.amended",
  "contract.execution.notice": "steward.contract.execution.notice",
  "contract.void.requested": "steward.contract.void.requested",
  "contract.void.acknowledged": "steward.contract.void.acknowledged",
  "invoice.issued": "steward.invoice.issued",
  "payment.instructed": "steward.payment.instructed",
  "obligation.acknowledged": "steward.obligation.acknowledged",
} as const satisfies Record<string, CommitteeTransactionType>;

export type LegacyTransactionType = keyof typeof LEGACY_TRANSACTION_TYPE_MAP;

export const legacyTransactionTypeSchema = z.enum([
  "contract.executed",
  "contract.amended",
  "contract.execution.notice",
  "contract.void.requested",
  "contract.void.acknowledged",
  "invoice.issued",
  "payment.instructed",
  "obligation.acknowledged",
]);

export function normalizeTransactionType(input: string): CommitteeTransactionType {
  const committee = committeeTransactionTypeSchema.safeParse(input);
  if (committee.success) return committee.data;
  const legacy = legacyTransactionTypeSchema.safeParse(input);
  if (legacy.success) return LEGACY_TRANSACTION_TYPE_MAP[legacy.data];
  throw new Error(`Unknown transaction type: ${input}`);
}

export function isContractExecutionNoticeType(type: string): boolean {
  return (
    type === "contract.execution.notice" ||
    type === "steward.contract.execution.notice"
  );
}

export function isContractVoidAcknowledgedType(type: string): boolean {
  return (
    type === "contract.void.acknowledged" ||
    type === "steward.contract.void.acknowledged"
  );
}

export function isContractVoidRequestedType(type: string): boolean {
  return (
    type === "contract.void.requested" || type === "steward.contract.void.requested"
  );
}

export function isContractExecutedType(type: string): boolean {
  return type === "contract.executed" || type === "steward.contract.executed";
}
