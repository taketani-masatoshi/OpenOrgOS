import type { WireApprovalTier } from "../../../../schemas/protocol/wire-approval.js";
import { loadCompany } from "../../data.js";
import { resolveJurisdictionApprovalPolicy } from "./policy.js";

export function normalizePersonName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

export function loadAuthorizedApprovers(): string[] {
  const company = loadCompany();
  const names = new Set<string>();

  if (company.representative) {
    for (const part of company.representative.split(/[、,]/)) {
      const n = normalizePersonName(part);
      if (n) names.add(n);
    }
  }

  const policy = resolveJurisdictionApprovalPolicy();
  for (const director of company.directors ?? []) {
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
  if (authorized.length === 0) return;

  const norm = normalizePersonName(approverId);
  const ok = authorized.some((a) => a === norm || a.includes(norm) || norm.includes(a));
  if (!ok) {
    throw new Error(
      `Approver "${approverId}" is not authorized (${tier} tier) — expected one of: ${authorized.join(", ")}`
    );
  }
}
