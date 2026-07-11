import type { ArApEntry } from "../../../../../../schemas/jp-bank-corporate.js";

export function resolveArApPaidAmount(entry: ArApEntry): number {
  return entry.paid_amount ?? 0;
}

export function resolveArApRemainingAmount(entry: ArApEntry): number {
  const paid = resolveArApPaidAmount(entry);
  return Math.max(0, entry.amount - paid);
}

export function resolveArApPlannedAmount(entry: ArApEntry): number {
  if (["collected", "paid", "cancelled"].includes(entry.status)) return 0;
  return resolveArApRemainingAmount(entry);
}

export function validateArApPaidAmount(entry: ArApEntry): string[] {
  const errors: string[] = [];
  const paid = entry.paid_amount;
  if (paid == null) {
    if (entry.status === "partial") {
      errors.push(`${entry.id}: status partial requires paid_amount`);
    }
    return errors;
  }
  if (paid > entry.amount) {
    errors.push(`${entry.id}: paid_amount exceeds amount`);
  }
  if (entry.status === "partial" && (paid <= 0 || paid >= entry.amount)) {
    errors.push(`${entry.id}: status partial requires 0 < paid_amount < amount`);
  }
  if (entry.status === "open" && paid > 0) {
    errors.push(`${entry.id}: status open cannot carry paid_amount`);
  }
  if (["collected", "paid"].includes(entry.status) && paid !== entry.amount) {
    errors.push(`${entry.id}: status ${entry.status} requires paid_amount = amount`);
  }
  return errors;
}
