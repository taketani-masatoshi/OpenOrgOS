import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  EXPENSE_CLAIM_BOARD_SUBJECT,
  EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT,
  EXPENSE_CLAIM_MANAGER_SUBJECT,
  EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
  expenseClaimsFileSchema,
} from "../../../schemas/finance/expense-claim.js";
import type { WireApprovalGateResult } from "../../../schemas/protocol/wire-approval.js";
import { loadBudgetDelegation } from "../org/budget-delegation.js";
import {
  findOperatorByApproverName,
  findOperatorById,
  listActiveOperators,
} from "../org/operators.js";
import { normalizePersonName } from "../jurisdiction/wire-governance/approvers.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { loadCompany } from "../data.js";

function representativeNames(): Set<string> {
  const company = loadCompany();
  const names = new Set<string>();
  for (const part of (company.representative ?? "").split(/[、,]/)) {
    if (part.trim()) names.add(normalizePersonName(part));
  }
  for (const director of company.directors ?? []) {
    if ((director.role ?? "").includes("代表取締役")) {
      names.add(normalizePersonName(director.name));
    }
  }
  for (const operator of listActiveOperators()) {
    if (operator.role === "ceo") {
      names.add(normalizePersonName(operator.display_name));
      if (operator.approver_name) {
        names.add(normalizePersonName(operator.approver_name));
      }
    }
  }
  return names;
}

function resolveRepresentativeName(candidate: string): string | undefined {
  const operator =
    findOperatorById(candidate) ?? findOperatorByApproverName(candidate);
  const candidates = [
    candidate,
    operator?.display_name,
    operator?.approver_name,
  ].filter((value): value is string => Boolean(value?.trim()));
  const authorized = representativeNames();
  return candidates
    .map(normalizePersonName)
    .find((name) => authorized.has(name));
}

export function isAuthorizedExpenseRepresentative(candidate: string): boolean {
  return Boolean(resolveRepresentativeName(candidate));
}

/** Catalog for Steward Chat co-approver / dual-rep pickers (REG-004 A/B). */
export function listExpenseClaimRepresentatives(): Array<{
  id: string;
  display_name: string;
}> {
  const byName = new Map<string, { id: string; display_name: string }>();
  for (const name of representativeNames()) {
    byName.set(name, { id: name, display_name: name });
  }
  for (const operator of listActiveOperators()) {
    if (operator.role !== "ceo") continue;
    const display =
      operator.approver_name?.trim() || operator.display_name.trim();
    const normalized = normalizePersonName(display);
    if (!normalized) continue;
    byName.set(normalized, {
      id: operator.operator_id,
      display_name: display,
    });
  }
  return [...byName.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja"),
  );
}

export function assertExpenseClaimRepresentativeApprover(input: {
  approverId: string;
  coApproverId?: string;
  requireDual?: boolean;
  policyRef?:
    | typeof EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT
    | typeof EXPENSE_CLAIM_LATE_EXCEPTION_SUBJECT
    | typeof EXPENSE_CLAIM_BOARD_SUBJECT
    | "expense.claim.ringi";
}): WireApprovalGateResult {
  const first = resolveRepresentativeName(input.approverId);
  if (!first) {
    throw new Error(
      `${input.policyRef ?? EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT}: approver must be an authorized representative director or CEO`,
    );
  }
  if (input.requireDual) {
    const second = input.coApproverId
      ? resolveRepresentativeName(input.coApproverId)
      : undefined;
    if (!second) {
      throw new Error(
        `${input.policyRef ?? "expense.claim.ringi"}: co-approver must be an authorized representative director or CEO`,
      );
    }
    if (first === second) {
      throw new Error("REG-004 tier B requires two distinct representatives");
    }
  }
  return {
    tier: input.requireDual ? "B" : input.policyRef === EXPENSE_CLAIM_BOARD_SUBJECT ? "C" : "A",
    policyRef: input.policyRef ?? EXPENSE_CLAIM_REPRESENTATIVE_SUBJECT,
    currency: "JPY",
  };
}

/**
 * Approver gate for expense.claim.manager (ADR 0032).
 * Department head of the claim's org unit, or CEO — not wire-governance amount tiers.
 */
export function assertExpenseClaimManagerApprover(input: {
  claimId: string;
  approverId: string;
  operatorId?: string;
}): WireApprovalGateResult {
  const claimId = input.claimId.trim();
  if (!claimId) {
    throw new Error(
      `${EXPENSE_CLAIM_MANAGER_SUBJECT}: subject_ref (claim_id) is required`,
    );
  }
  const path = join(getDataDir(), "finance", "expense-claims.yaml");
  if (!existsSync(path)) {
    throw new Error(`Expense claims file missing for ${claimId}`);
  }
  const file = readYamlFile(path, expenseClaimsFileSchema);
  const claim = file.claims.find((row) => row.claim_id === claimId);
  if (!claim) {
    throw new Error(`Expense claim not found: ${claimId}`);
  }

  const budget = loadBudgetDelegation();
  const department = budget?.departments.find(
    (d) => d.org_unit_id === claim.org_unit_id,
  );
  if (!department) {
    throw new Error(
      `No department budget for claim org unit ${claim.org_unit_id}`,
    );
  }

  const headId = department.head_operator_id;
  const head = findOperatorById(headId);
  const authorizedIds = new Set<string>([headId]);
  const authorizedNames = new Set<string>();
  if (head?.display_name) {
    authorizedNames.add(normalizePersonName(head.display_name));
  }
  if (head?.approver_name) {
    authorizedNames.add(normalizePersonName(head.approver_name));
  }

  for (const op of listActiveOperators()) {
    if (op.role === "ceo") {
      authorizedIds.add(op.operator_id);
      authorizedNames.add(normalizePersonName(op.display_name));
      if (op.approver_name) {
        authorizedNames.add(normalizePersonName(op.approver_name));
      }
    }
  }

  const candidates = [input.operatorId, input.approverId].filter(
    (v): v is string => Boolean(v?.trim()),
  );
  for (const candidate of candidates) {
    if (authorizedIds.has(candidate.trim())) {
      return {
        tier: "A",
        policyRef: EXPENSE_CLAIM_MANAGER_SUBJECT,
        currency: "JPY",
      };
    }
    const byName = findOperatorByApproverName(candidate);
    if (byName && authorizedIds.has(byName.operator_id)) {
      return {
        tier: "A",
        policyRef: EXPENSE_CLAIM_MANAGER_SUBJECT,
        currency: "JPY",
      };
    }
    const byId = findOperatorById(candidate);
    if (byId && authorizedIds.has(byId.operator_id)) {
      return {
        tier: "A",
        policyRef: EXPENSE_CLAIM_MANAGER_SUBJECT,
        currency: "JPY",
      };
    }
    if (authorizedNames.has(normalizePersonName(candidate))) {
      return {
        tier: "A",
        policyRef: EXPENSE_CLAIM_MANAGER_SUBJECT,
        currency: "JPY",
      };
    }
  }

  const expected = [
    head?.approver_name ?? head?.display_name ?? headId,
    "CEO",
  ].join(", ");
  throw new Error(
    `${EXPENSE_CLAIM_MANAGER_SUBJECT}: approver "${input.approverId}" is not the department head or CEO` +
      ` for ${claim.org_unit_id} — expected one of: ${expected}`,
  );
}
