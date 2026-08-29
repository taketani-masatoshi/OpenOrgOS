import type { OrgBudgetPayload } from "./api";

/** Last successful org budget payload — instant paint when remounting wallet / admin. */
let snapshot: OrgBudgetPayload | null = null;

export function getOrgBudgetSnapshot(): OrgBudgetPayload | null {
  return snapshot;
}

export function setOrgBudgetSnapshot(data: OrgBudgetPayload): void {
  snapshot = data;
}
