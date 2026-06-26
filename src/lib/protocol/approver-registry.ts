import YAML from "yaml";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  approvalThresholdsSchema,
  type JurisdictionApprovalPolicy,
} from "../../../schemas/protocol/approval-thresholds.js";
import { loadCompany } from "../data.js";
import { loadTenantConfig, ROOT_DIR } from "../tenant.js";
import type { Reg004Tier } from "./approval-policy.js";

const THRESHOLDS_PATH = join(ROOT_DIR, "steward", "platform", "protocol", "approval-thresholds.yaml");

let cachedThresholds: ReturnType<typeof approvalThresholdsSchema.parse> | undefined;

function loadYamlThresholds() {
  if (cachedThresholds) return cachedThresholds;
  cachedThresholds = approvalThresholdsSchema.parse(YAML.parse(readFileSync(THRESHOLDS_PATH, "utf-8")));
  return cachedThresholds;
}

export function resolveJurisdictionApprovalPolicy(): JurisdictionApprovalPolicy {
  const tenant = loadTenantConfig();
  const code = tenant.jurisdiction ?? "JP";
  const registry = loadYamlThresholds();
  return registry.jurisdictions[code] ?? registry.jurisdictions.default!;
}

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

export function assertApproverAuthorized(approverId: string, tier: Reg004Tier): void {
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
