import type { WireApprovalTier } from "../../../schemas/protocol/wire-approval.js";
import { loadOrgAuthorizedPersons } from "./tenant-data.js";
import { resolveJurisdictionApprovalPolicy } from "../jurisdiction/wire-governance/policy.js";
import { listActiveOperators } from "./operators.js";

export function normalizePersonName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

export function loadAuthorizedApprovers(): string[] {
  const names = new Set<string>();

  for (const op of listActiveOperators()) {
    if (op.role === "ceo" || op.role === "approver") {
      if (op.approver_name) names.add(normalizePersonName(op.approver_name));
      names.add(normalizePersonName(op.display_name));
    }
  }

  const persons = loadOrgAuthorizedPersons();

  if (persons.representative) {
    for (const part of persons.representative.split(/[、,]/)) {
      const n = normalizePersonName(part);
      if (n) names.add(n);
    }
  }

  const policy = resolveJurisdictionApprovalPolicy();
  for (const director of persons.directors) {
    const role = director.role ?? "";
    const matchesRole =
      policy.tiers.A.roles.length === 0 ||
      policy.tiers.A.roles.some((r) => role.includes(r) || r.includes(role));
    if (matchesRole) {
      names.add(normalizePersonName(director.name));
    }
  }

  return [...names];
}

export function assertApproverAuthorized(approverId: string, tier: WireApprovalTier): void {
  const authorized = loadAuthorizedApprovers();
  const prod =
    process.env.ORGOS_ENV === "production" ||
    process.env.ORGOS_PROD === "1" ||
    process.env.NODE_ENV === "production";

  if (authorized.length === 0) {
    if (prod) {
      throw new Error(
        `No authorized approvers configured — populate data/org/operators.yaml or company.yaml directors (${tier} tier)`
      );
    }
    return;
  }

  const norm = normalizePersonName(approverId);
  const ok = authorized.some((a) => a === norm || a.includes(norm) || norm.includes(a));
  if (!ok) {
    throw new Error(
      `Approver "${approverId}" is not authorized (${tier} tier) — expected one of: ${authorized.join(", ")}`
    );
  }
}
