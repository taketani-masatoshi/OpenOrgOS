import type { OrgBudgetPayload } from "./api";

export type ClaimPlainStatus = "waiting" | "passed" | "sent_back";

/**
 * Same rule as the server default (`defaultReimbursementDueOn`): the next
 * Friday strictly after `from`, so the claimant never has to ask.
 */
export function nextFridayIso(from = new Date()): string {
  const day = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const daysUntilFriday = ((5 - day.getUTCDay() + 7) % 7) || 7;
  day.setUTCDate(day.getUTCDate() + daysUntilFriday);
  return day.toISOString().slice(0, 10);
}

/** Words the claimant sees. Gate names (needs_rep_approval …) stay internal. */
export function claimPlainStatus(status: string): ClaimPlainStatus {
  if (status === "rejected") return "sent_back";
  if (status === "draft" || status === "pending_approval") return "waiting";
  return "passed";
}

type BudgetMember = NonNullable<
  OrgBudgetPayload["departments"]
>[number]["members"][number];

export function findBudgetMember(
  budget: OrgBudgetPayload | null,
  personId: string,
): BudgetMember | null {
  for (const department of budget?.departments ?? []) {
    const member = department.members.find((row) => row.person_id === personId);
    if (member) return member;
  }
  return null;
}

export function findOrgUnitIdForPerson(
  budget: OrgBudgetPayload | null,
  personId: string,
): string {
  for (const department of budget?.departments ?? []) {
    if (department.members.some((row) => row.person_id === personId)) {
      return department.org_unit_id;
    }
  }
  return "";
}

/** Envelope left for this person × category; null when no envelope exists. */
export function personEnvelopeRemainingYen(
  budget: OrgBudgetPayload | null,
  personId: string,
  accountCode?: string,
): number | null {
  const member = findBudgetMember(budget, personId);
  if (!member) return null;
  if (!accountCode) return member.allocation_yen - member.actual_yen;
  const category = member.categories.find(
    (row) => row.account_code === accountCode,
  );
  if (!category) return null;
  return category.allocation_yen - category.actual_yen;
}

export function personDisplayName(
  budget: OrgBudgetPayload | null,
  personId: string,
): string {
  return findBudgetMember(budget, personId)?.display_name ?? personId;
}

export function claimsAwaitingApproval(
  budget: OrgBudgetPayload | null,
): NonNullable<OrgBudgetPayload["expense_claims"]> {
  return (budget?.expense_claims ?? []).filter(
    (claim) => claim.status === "pending_approval",
  );
}
