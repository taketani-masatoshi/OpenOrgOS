import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { setTenantId } from "../lib/tenant.js";
import {
  proposeOrgApproval,
  approveOrgApproval,
  rejectOrgApproval,
  listOrgApprovals,
  findOrgApproval,
} from "../lib/org/approval/index.js";
import {
  bridgeAuditEventToProtocolChain,
  loadOrgAuditBridgeConfig,
} from "../lib/org/audit-bridge.js";
import { getOrgAuditBridgeConfigPath } from "../lib/org/paths.js";
import { listAuditEvents } from "../lib/audit-log.js";
import { orgAuditBridgeConfigSchema, orgAuditBridgeRecommendedConfig } from "../../schemas/org/audit-bridge.js";
import { writeYamlFile } from "../lib/utils.js";
import { requireCliOperator, requireCliConfigWrite } from "../lib/console-auth/cli-operator.js";

export interface OrgApprovalProposeOptions {
  subjectType: string;
  operator: string;
  subjectRef?: string;
  message?: string;
  amount?: number;
  currency?: string;
  tenant?: string;
  json?: boolean;
}

export function runOrgApprovalPropose(opts: OrgApprovalProposeOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const approval = proposeOrgApproval({
    scope: "internal",
    subjectType: opts.subjectType,
    subjectRef: opts.subjectRef,
    proposedBy: opts.operator,
    message: opts.message,
    amount:
      opts.amount != null
        ? { value: opts.amount, currency: opts.currency ?? "JPY" }
        : undefined,
  });
  if (opts.json) {
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  console.log(`✓ proposed ${approval.approval_id} · ${approval.subject_type}`);
  console.log(`  status: ${approval.status} · policy: ${approval.approval_policy_ref ?? "—"}`);
}

export interface OrgApprovalApproveOptions {
  id: string;
  approver: string;
  coApprover?: string;
  operator?: string;
  tenant?: string;
  json?: boolean;
}

export function runOrgApprovalApprove(opts: OrgApprovalApproveOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const auth = requireCliOperator({ permission: "chat:approve", command: "org approval approve" });
  try {
    const result = approveOrgApproval({
      approvalId: opts.id,
      approverId: opts.approver || auth.record.approver_name || auth.record.display_name,
      coApproverId: opts.coApprover,
      operatorId: opts.operator || auth.record.operator_id,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ approved ${result.approval.approval_id}`);
    console.log(`  tier: ${result.approval.approval_tier ?? "—"} · audit: ${result.auditEnvelope?.event_id ?? "—"}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface OrgApprovalRejectOptions {
  id: string;
  approver: string;
  reason?: string;
  tenant?: string;
  json?: boolean;
}

export function runOrgApprovalReject(opts: OrgApprovalRejectOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const rejected = rejectOrgApproval({
    approvalId: opts.id,
    approverId: opts.approver,
    reason: opts.reason,
  });
  if (opts.json) {
    console.log(JSON.stringify(rejected, null, 2));
    return;
  }
  console.log(`✓ rejected ${rejected.approval_id}`);
}

export interface OrgApprovalListOptions {
  status?: string;
  tenant?: string;
  json?: boolean;
}

export function runOrgApprovalList(opts: OrgApprovalListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const status = opts.status as
    | "pending_approval"
    | "approved"
    | "rejected"
    | "completed"
    | undefined;
  const rows = listOrgApprovals({ scope: "internal", status });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("(no internal approvals)");
    return;
  }
  console.log("| id | status | subject | proposed_by |");
  console.log("|---|---|---|---|");
  for (const row of rows) {
    console.log(
      `| ${row.approval_id} | ${row.status} | ${row.subject_type}${row.subject_ref ? ` (${row.subject_ref})` : ""} | ${row.proposed_by} |`
    );
  }
}

export interface OrgApprovalShowOptions {
  id: string;
  tenant?: string;
  json?: boolean;
}

export function runOrgApprovalShow(opts: OrgApprovalShowOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const approval = findOrgApproval(opts.id);
  if (!approval || approval.scope !== "internal") {
    console.error(`Internal approval ${opts.id} not found`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(approval, null, 2));
    return;
  }
  console.log(JSON.stringify(approval, null, 2));
}

export interface OrgAuditBridgeOptions {
  since?: string;
  enable?: boolean;
  disable?: boolean;
  tenant?: string;
  json?: boolean;
}

export function runOrgAuditBridge(opts: OrgAuditBridgeOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);

  if (opts.enable || opts.disable) {
    requireCliConfigWrite("org audit-bridge");
    const existing = existsSync(getOrgAuditBridgeConfigPath())
      ? loadOrgAuditBridgeConfig()
      : orgAuditBridgeRecommendedConfig;
    const config = orgAuditBridgeConfigSchema.parse({
      enabled: opts.enable === true,
      events: existing.events,
    });
    const path = getOrgAuditBridgeConfigPath();
    mkdirSync(dirname(path), { recursive: true });
    writeYamlFile(path, config);
    console.log(`✓ audit bridge ${config.enabled ? "enabled" : "disabled"} · ${path}`);
    if (!opts.since) return;
  }

  const config = loadOrgAuditBridgeConfig();
  if (!config.enabled) {
    console.error("Audit bridge disabled — run with --enable or set data/org/audit-bridge.yaml");
    process.exit(1);
  }

  const events = listAuditEvents({ since: opts.since });
  let bridged = 0;
  for (const event of events) {
    const envelope = bridgeAuditEventToProtocolChain(event);
    if (envelope) bridged++;
  }

  if (opts.json) {
    console.log(JSON.stringify({ bridged, scanned: events.length, since: opts.since }, null, 2));
    return;
  }
  console.log(`✓ bridged ${bridged}/${events.length} operational audit event(s) to audit-chain`);
}
