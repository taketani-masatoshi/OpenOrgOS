import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  trustedOperatorsRegistrySchema,
  type GovernanceRequest,
  type TrustedOperatorEntry,
  type TrustedOperatorsRegistry,
} from "../../../schemas/protocol/trusted-operators.js";
import { ROOT_DIR } from "../tenant.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

const TRUSTED_OPERATORS_PATH = join(ROOT_DIR, "steward/platform/protocol/trusted-operators.yaml");

export function getTrustedOperatorsRegistryPath(): string {
  return TRUSTED_OPERATORS_PATH;
}

export function loadTrustedOperatorsRegistry(): TrustedOperatorsRegistry {
  if (!existsSync(TRUSTED_OPERATORS_PATH)) {
    return trustedOperatorsRegistrySchema.parse({
      version: "1",
      operators: [],
      governance_requests: [],
    });
  }
  return readYamlFile(TRUSTED_OPERATORS_PATH, trustedOperatorsRegistrySchema);
}

export function saveTrustedOperatorsRegistry(registry: TrustedOperatorsRegistry): void {
  writeYamlFile(TRUSTED_OPERATORS_PATH, registry);
}

export interface TrustedOperatorValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export function validateTrustedOperatorsRegistry(): {
  ok: boolean;
  issues: TrustedOperatorValidationIssue[];
} {
  const issues: TrustedOperatorValidationIssue[] = [];
  try {
    const reg = loadTrustedOperatorsRegistry();
    const seenIds = new Set<string>();
    for (const op of reg.operators) {
      if (seenIds.has(op.operator_id)) {
        issues.push({
          code: "operator-duplicate-id",
          message: `Duplicate operator_id: ${op.operator_id}`,
          severity: "error",
        });
      }
      seenIds.add(op.operator_id);
      if (op.status === "revoked" && !op.revoked_at) {
        issues.push({
          code: "operator-revoke-missing-timestamp",
          message: `${op.operator_id}: revoked without revoked_at`,
          severity: "error",
        });
      }
      if (op.status === "active" && op.revoked_at) {
        issues.push({
          code: "operator-active-with-revoked-at",
          message: `${op.operator_id}: active but revoked_at set`,
          severity: "error",
        });
      }
    }
    if (reg.revocation_sla.escalation_hours > reg.revocation_sla.max_hours) {
      issues.push({
        code: "revocation-sla-invalid",
        message: "escalation_hours must not exceed max_hours",
        severity: "error",
      });
    }
  } catch (e) {
    issues.push({
      code: "trusted-operators-invalid",
      message: e instanceof Error ? e.message : String(e),
      severity: "error",
    });
  }
  return { ok: issues.filter((i) => i.severity === "error").length === 0, issues };
}

export interface RevocationSlaCheck {
  ok: boolean;
  overdue: Array<{ operator_id: string; hours_since_revoke: number; sla_hours: number }>;
}

export function checkRevocationSla(): RevocationSlaCheck {
  const reg = loadTrustedOperatorsRegistry();
  const now = Date.now();
  const overdue: RevocationSlaCheck["overdue"] = [];
  for (const op of reg.operators) {
    if (op.status !== "revoked" || !op.revoked_at) continue;
    const slaHours = op.revocation_sla_hours ?? reg.revocation_sla.max_hours;
    const hours = (now - new Date(op.revoked_at).getTime()) / 3_600_000;
    if (hours > slaHours) {
      overdue.push({ operator_id: op.operator_id, hours_since_revoke: hours, sla_hours: slaHours });
    }
  }
  return { ok: overdue.length === 0, overdue };
}

export function revokeTrustedOperator(opts: {
  operatorId: string;
  reason?: string;
  at?: string;
}): TrustedOperatorEntry {
  const reg = loadTrustedOperatorsRegistry();
  const op = reg.operators.find((o) => o.operator_id === opts.operatorId);
  if (!op) throw new Error(`Operator ${opts.operatorId} not found`);
  op.status = "revoked";
  op.revoked_at = opts.at ?? new Date().toISOString();
  op.revoke_reason = opts.reason;
  saveTrustedOperatorsRegistry(reg);
  return op;
}

export function submitGovernanceRequest(opts: {
  operatorId: string;
  orgName: string;
  jurisdiction: string;
  hubIds: string[];
  requestedBy: string;
}): GovernanceRequest {
  const reg = loadTrustedOperatorsRegistry();
  const request: GovernanceRequest = {
    request_id: randomUUID(),
    operator_id: opts.operatorId,
    org_name: opts.orgName,
    jurisdiction: opts.jurisdiction,
    hub_ids: opts.hubIds,
    requested_at: new Date().toISOString(),
    requested_by: opts.requestedBy,
    status: "pending",
  };
  reg.governance_requests.push(request);
  saveTrustedOperatorsRegistry(reg);
  return request;
}

export function decideGovernanceRequest(opts: {
  requestId: string;
  approve: boolean;
  decidedBy: string;
  note?: string;
  authorityId?: string;
}): { request: GovernanceRequest; operator?: TrustedOperatorEntry } {
  const reg = loadTrustedOperatorsRegistry();
  const req = reg.governance_requests.find((r) => r.request_id === opts.requestId);
  if (!req) throw new Error(`Governance request ${opts.requestId} not found`);
  if (req.status !== "pending") throw new Error(`Request ${opts.requestId} already ${req.status}`);

  req.status = opts.approve ? "approved" : "rejected";
  req.decided_at = new Date().toISOString();
  req.decided_by = opts.decidedBy;
  req.decision_note = opts.note;

  let operator: TrustedOperatorEntry | undefined;
  if (opts.approve) {
    operator = {
      operator_id: req.operator_id,
      org_name: req.org_name,
      jurisdiction: req.jurisdiction,
      hub_ids: req.hub_ids,
      status: "active",
      certified_at: new Date().toISOString(),
      certified_by: opts.authorityId ?? "WTA-JP-DEMO",
      revocation_sla_hours: reg.revocation_sla.max_hours,
    };
    reg.operators = reg.operators.filter((o) => o.operator_id !== req.operator_id);
    reg.operators.push(operator);
  }

  saveTrustedOperatorsRegistry(reg);
  return { request: req, operator };
}

export function listActiveOperators(jurisdiction?: string): TrustedOperatorEntry[] {
  const reg = loadTrustedOperatorsRegistry();
  return reg.operators.filter(
    (o) => o.status === "active" && (!jurisdiction || o.jurisdiction === jurisdiction)
  );
}
