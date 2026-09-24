/**
 * Expense-claim YAML store: path / load / save / lock / revisions / ids.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  expenseClaimSchema,
  expenseClaimsFileSchema,
  type ExpenseClaim,
  type ExpenseClaimAllocation,
  type ExpenseClaimsFile,
} from "../../../schemas/finance/expense-claim.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { requireExpectedRevisionToken } from "../cas-test-mode.js";

const CLAIMS_REL = "finance/expense-claims.yaml";

export function expenseClaimsPath(): string {
  return join(getDataDir(), CLAIMS_REL);
}

export function loadExpenseClaims(): ExpenseClaimsFile {
  const path = expenseClaimsPath();
  if (!existsSync(path)) {
    return expenseClaimsFileSchema.parse({
      version: 1,
      claims_revision: 0,
      claims: [],
    });
  }
  return readYamlFile(path, expenseClaimsFileSchema);
}

/** Nestable exclusive section for load → assert → mutate → save. */
let expenseClaimsLockDepth = 0;

export function withExpenseClaimsLock<T>(fn: () => T): T {
  if (expenseClaimsLockDepth > 0) return fn();
  return withYamlFileLock(expenseClaimsPath(), () => {
    expenseClaimsLockDepth += 1;
    try {
      return fn();
    } finally {
      expenseClaimsLockDepth -= 1;
    }
  });
}

export function saveExpenseClaims(file: ExpenseClaimsFile): void {
  const path = expenseClaimsPath();
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  const parsed = expenseClaimsFileSchema.parse(file);
  const write = (): void => {
    writeYamlFileAtomic(path, parsed);
  };
  if (expenseClaimsLockDepth > 0) {
    write();
    return;
  }
  withYamlFileLock(path, write);
}

/** Optimistic concurrency token for HTTP `expected_claims_revision`. */
export function expenseClaimsRevision(file?: ExpenseClaimsFile | null): string {
  return String(file?.claims_revision ?? 0);
}

export class ExpenseClaimsRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Expense claims revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "ExpenseClaimsRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function assertExpectedClaimsRevision(
  file: ExpenseClaimsFile,
  expectedRevision?: string,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_claims_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const current = expenseClaimsRevision(file);
  if (current !== expectedRevision) {
    throw new ExpenseClaimsRevisionConflictError(current, expectedRevision);
  }
}

/** Per-claim optimistic concurrency token for HTTP `expected_claim_revision`. */
export function claimRevision(claim?: ExpenseClaim | null): string {
  return String(claim?.claim_revision ?? 0);
}

export class ExpenseClaimItemRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Expense claim revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "ExpenseClaimItemRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function assertExpectedClaimRevision(
  claim: ExpenseClaim,
  expectedRevision?: string,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_claim_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const current = claimRevision(claim);
  if (current !== expectedRevision) {
    throw new ExpenseClaimItemRevisionConflictError(current, expectedRevision);
  }
}

export function bumpAndSaveExpenseClaims(file: ExpenseClaimsFile): void {
  file.claims_revision = (file.claims_revision ?? 0) + 1;
  saveExpenseClaims(file);
}

/** Bump per-claim + file tokens, then persist. */
export function bumpClaimAndSaveExpenseClaims(
  file: ExpenseClaimsFile,
  index: number,
  claim: ExpenseClaim,
): ExpenseClaim {
  const next = expenseClaimSchema.parse({
    ...claim,
    claim_revision: (claim.claim_revision ?? 0) + 1,
  });
  file.claims[index] = next;
  bumpAndSaveExpenseClaims(file);
  return next;
}

/** Next claim id for the given day (exported for propose module). */
export function nextClaimId(date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  const file = loadExpenseClaims();
  const prefix = `ECL-${day}-`;
  let max = 0;
  for (const claim of file.claims) {
    if (!claim.claim_id.startsWith(prefix)) continue;
    const n = Number(claim.claim_id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function claimAllocations(claim: ExpenseClaim): ExpenseClaimAllocation[] {
  return (
    claim.allocations ?? [
      {
        account_code: claim.account_code,
        amount_yen: claim.amount_yen,
        org_unit_id: claim.org_unit_id,
        person_id: claim.person_id,
      },
    ]
  ).map((allocation) => ({
    ...allocation,
    person_id: allocation.person_id ?? claim.person_id,
  }));
}

export function matchingClaimAllocationYen(
  claim: ExpenseClaim,
  personId: string,
  orgUnitId: string,
  accountCode: string,
): number {
  return claimAllocations(claim)
    .filter(
      (allocation) =>
        allocation.person_id === personId &&
        allocation.org_unit_id === orgUnitId &&
        allocation.account_code === accountCode,
    )
    .reduce((sum, allocation) => sum + allocation.amount_yen, 0);
}

export function persistClaimPatch(
  claimId: string,
  patch: Partial<ExpenseClaim>,
  expectedClaimRevision: string,
): ExpenseClaim {
  return withExpenseClaimsLock(() => {
    const file = loadExpenseClaims();
    const index = file.claims.findIndex((c) => c.claim_id === claimId);
    if (index < 0) {
      return expenseClaimSchema.parse({
        ...patch,
        claim_id: claimId,
      } as ExpenseClaim);
    }
    const current = file.claims[index]!;
    assertExpectedClaimRevision(current, expectedClaimRevision);
    const next = expenseClaimSchema.parse({ ...current, ...patch });
    return bumpClaimAndSaveExpenseClaims(file, index, next);
  });
}

export function listExpenseClaims(filter?: {
  personId?: string;
  status?: ExpenseClaim["status"];
  orgUnitId?: string;
}): ExpenseClaim[] {
  return loadExpenseClaims().claims.filter((c) => {
    if (filter?.personId && c.person_id !== filter.personId) return false;
    if (filter?.status && c.status !== filter.status) return false;
    if (filter?.orgUnitId && c.org_unit_id !== filter.orgUnitId) return false;
    return true;
  });
}

export function findExpenseClaim(claimId: string): ExpenseClaim | undefined {
  return loadExpenseClaims().claims.find((c) => c.claim_id === claimId);
}
