import { filingError } from "./errors.js";

export function assertIdempotentPackage(input: {
  existing: { idempotencyKey: string; packageSha256: string } | undefined;
  idempotencyKey: string;
  packageSha256: string;
}): "create" | "reuse" {
  if (!input.existing) return "create";
  if (input.existing.idempotencyKey !== input.idempotencyKey) return "create";
  if (input.existing.packageSha256 !== input.packageSha256) {
    throw filingError(
      "EFILING_IDEMPOTENCY_CLASH",
      "idempotency key is already bound to a different package hash",
      "DUPLICATE_SUBMISSION"
    );
  }
  return "reuse";
}

export function assertSlotAvailable(activeInSlot: boolean): void {
  if (activeInSlot) {
    throw filingError(
      "EFILING_SLOT_CONFLICT",
      "an active filing already occupies this taxpayer|procedure|year|revision slot",
      "DUPLICATE_SUBMISSION"
    );
  }
}

export function assertWriteRevision(expected: number, actual: number): void {
  if (expected !== actual) {
    throw filingError(
      "EFILING_STALE_WRITE",
      `stale filing write: expected revision ${expected}, store has ${actual}`
    );
  }
}
