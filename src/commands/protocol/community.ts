/** Community operators and governance command handlers. */
import {
  listActiveOperators,
  loadTrustedOperatorsRegistry,
  validateTrustedOperatorsRegistry,
  checkRevocationSla,
  revokeTrustedOperator,
  submitGovernanceRequest,
  decideGovernanceRequest,
} from "../../lib/protocol/distribution/trusted-operators.js";
import { computeCommunityReadiness } from "../../lib/protocol/readiness/community-readiness.js";
import { exportCommunityProtocolBundle } from "../../lib/protocol/adapters/community-export.js";
import { resolveEcoStrictCap } from "../../lib/protocol/readiness/eco-production-evidence.js";
import { join } from "node:path";


export interface ProtocolCommunityOperatorsListOptions {
  jurisdiction?: string;
  json?: boolean;
}

export function runProtocolCommunityOperatorsList(opts: ProtocolCommunityOperatorsListOptions): void {
  const ops = opts.jurisdiction
    ? listActiveOperators(opts.jurisdiction)
    : loadTrustedOperatorsRegistry().operators;
  if (opts.json) {
    console.log(JSON.stringify(ops, null, 2));
    return;
  }
  console.log(`trusted operators: ${ops.length}`);
  for (const op of ops) {
    console.log(`  · ${op.operator_id} (${op.status}) · ${op.org_name} · hubs: ${op.hub_ids.join(", ")}`);
  }
}

export interface ProtocolCommunityOperatorsValidateOptions {
  json?: boolean;
}

export function runProtocolCommunityOperatorsValidate(opts: ProtocolCommunityOperatorsValidateOptions): void {
  const result = validateTrustedOperatorsRegistry();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Trusted operators registry OK");
    return;
  }
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolCommunityCheckSlaOptions {
  json?: boolean;
}

export function runProtocolCommunityCheckSla(opts: ProtocolCommunityCheckSlaOptions): void {
  const result = checkRevocationSla();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Revocation SLA: no overdue revocations");
    return;
  }
  for (const o of result.overdue) {
    console.error(`  ✗ ${o.operator_id}: ${o.hours_since_revoke.toFixed(1)}h > SLA ${o.sla_hours}h`);
  }
  process.exit(1);
}

export interface ProtocolCommunityRevokeOptions {
  operatorId: string;
  reason?: string;
  json?: boolean;
}

export function runProtocolCommunityRevoke(opts: ProtocolCommunityRevokeOptions): void {
  const op = revokeTrustedOperator({ operatorId: opts.operatorId, reason: opts.reason });
  if (opts.json) {
    console.log(JSON.stringify(op, null, 2));
    return;
  }
  console.log(`✓ revoked operator ${op.operator_id} at ${op.revoked_at}`);
}

export interface ProtocolCommunityGovernanceSubmitOptions {
  operatorId: string;
  orgName: string;
  jurisdiction: string;
  hubIds: string[];
  requestedBy: string;
  json?: boolean;
}

export function runProtocolCommunityGovernanceSubmit(
  opts: ProtocolCommunityGovernanceSubmitOptions
): void {
  const req = submitGovernanceRequest({
    operatorId: opts.operatorId,
    orgName: opts.orgName,
    jurisdiction: opts.jurisdiction,
    hubIds: opts.hubIds,
    requestedBy: opts.requestedBy,
  });
  if (opts.json) {
    console.log(JSON.stringify(req, null, 2));
    return;
  }
  console.log(`✓ governance request ${req.request_id} · ${req.operator_id} pending`);
}

export interface ProtocolCommunityGovernanceDecideOptions {
  requestId: string;
  approve: boolean;
  decidedBy: string;
  note?: string;
  authorityId?: string;
  json?: boolean;
}

export function runProtocolCommunityGovernanceDecide(
  opts: ProtocolCommunityGovernanceDecideOptions
): void {
  const { request, operator } = decideGovernanceRequest({
    requestId: opts.requestId,
    approve: opts.approve,
    decidedBy: opts.decidedBy,
    note: opts.note,
    authorityId: opts.authorityId,
  });
  if (opts.json) {
    console.log(JSON.stringify({ request, operator }, null, 2));
    return;
  }
  console.log(`✓ governance ${request.status}: ${request.operator_id}`);
  if (operator) console.log(`  operator certified · hubs: ${operator.hub_ids.join(", ")}`);
}

export interface ProtocolCommunityReadinessOptions {
  json?: boolean;
}

export function runProtocolCommunityReadiness(opts: ProtocolCommunityReadinessOptions): void {
  const result = computeCommunityReadiness();
  const ecoCap = resolveEcoStrictCap();
  if (opts.json) {
    console.log(JSON.stringify({ ...result, strict_cap: ecoCap }, null, 2));
    return;
  }
  console.log(`Community readiness (Steward-side): ${result.score}/${ecoCap}`);
  for (const check of result.checks) {
    console.log(`  ${check.ok ? "✓" : "✗"} ${check.id}: ${check.detail}`);
  }
}

export interface ProtocolCommunityExportOptions {
  json?: boolean;
}

export function runProtocolCommunityExport(opts: ProtocolCommunityExportOptions = {}): void {
  const result = exportCommunityProtocolBundle();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Community protocol export → ${result.dest}`);
  for (const f of result.files) {
    console.log(`  · ${f}`);
  }
}

