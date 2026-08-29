import type { OperatorRecord } from "../../../schemas/org/operator.js";
import { findBudgetPerson } from "../hr/person-directory.js";
import { loadBudgetDelegation } from "./budget-delegation.js";
import { resolveEffectiveOperatorAccess } from "./operator-effective.js";

/**
 * The human behind an operator seat, as an org-chart person id.
 * Explicit `person_id` wins; `org_unit_id` is accepted when that node is
 * itself a person in the budget directory (small orgs where a unit node
 * carries the employee_id).
 */
export function resolveOperatorClaimPersonId(
  record: OperatorRecord,
): string | undefined {
  const explicit = record.person_id?.trim();
  if (explicit && findBudgetPerson(explicit)) return explicit;
  const unit = record.org_unit_id?.trim();
  if (unit && findBudgetPerson(unit)) return unit;
  return undefined;
}

/**
 * Employee (claim-only) seat: may file its own claims, may not approve.
 * Such a seat is locked to its own person_id server-side.
 */
export function isClaimOnlySeat(record: OperatorRecord): boolean {
  const permissions = resolveEffectiveOperatorAccess(record).permissions;
  return (
    permissions.includes("expense:claim") &&
    !permissions.includes("chat:approve")
  );
}

/** Department that holds this person's envelope, for claim ingest. */
export function resolveClaimOrgUnitId(
  personId: string,
  fiscalYear?: string,
): string | undefined {
  const file = loadBudgetDelegation(
    fiscalYear ? { fiscalYear } : undefined,
  );
  return file?.departments.find((department) =>
    department.member_budgets.some((member) => member.person_id === personId),
  )?.org_unit_id;
}

export class ClaimPersonMismatchError extends Error {
  readonly code = "claim_person_forbidden" as const;

  constructor(operatorId: string) {
    super(
      `Operator ${operatorId} may only file expense claims for their own person_id`,
    );
    this.name = "ClaimPersonMismatchError";
  }
}

/**
 * Person id an ingest request may use.
 * Claim-only seats are pinned to their own person; other seats keep the
 * requested person (manager filing on behalf remains a manager action).
 */
export function resolveIngestPersonId(
  record: OperatorRecord,
  requestedPersonId: string,
): string {
  if (!isClaimOnlySeat(record)) return requestedPersonId;
  const own = resolveOperatorClaimPersonId(record);
  if (!own) {
    throw new Error(
      `Operator ${record.operator_id} has no person_id / org_unit_id bound to a person — cannot file a claim`,
    );
  }
  const requested = requestedPersonId.trim();
  if (requested && requested !== own) {
    throw new ClaimPersonMismatchError(record.operator_id);
  }
  return own;
}
