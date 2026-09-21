/**
 * Gate for cash / runway fields on Today and Executive Home HTTP responses.
 *
 * AGENTS.md: Secretary must not read data/finance/**. Readonly seats hold
 * chat:read only. CEO / approver seats hold chat:approve (registry SSOT).
 * Do not invent a new permission — reuse chat:approve as documented for
 * ceo / approver seats.
 */
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import { operatorHasPermission, resolveOperatorFromSessionUser } from "./operator-rbac.js";

export function operatorMayViewFinanceSummary(user: WireConsoleUser): boolean {
  const record = resolveOperatorFromSessionUser(user);
  if (!record || record.status !== "active") return false;
  if (record.role === "ceo" || record.role === "approver") return true;
  return operatorHasPermission(record, "chat:approve");
}

type FinanceSummaryFields = {
  finance_runway_months?: number | null;
  finance_cash_balance?: number | null;
  finance_burn_rate?: number;
  finance_basis_month?: string;
  finance_cash_flow_mode?: "surplus" | "deficit" | "break_even";
  finance_metrics_source?: string;
};

/** Strip finance KPI numbers when the seat is not ceo/approver. */
export function redactFinanceSummaryFields<T extends FinanceSummaryFields>(
  payload: T,
  allow: boolean
): T {
  if (allow) return payload;
  const next = { ...payload };
  next.finance_runway_months = null;
  next.finance_cash_balance = null;
  delete next.finance_burn_rate;
  delete next.finance_basis_month;
  delete next.finance_cash_flow_mode;
  delete next.finance_metrics_source;
  return next;
}
