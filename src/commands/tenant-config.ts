import { requireCliHumanApproval, requireCliOperator } from "../lib/console-auth/cli-operator.js";
import {
  findOrgApproval,
} from "../lib/org/approval/approve.js";
import {
  applyTenantConfigChange,
  approveAndApplyTenantConfigChange,
  loadTenantConfigChanges,
  previewTenantConfigChange,
  proposeTenantConfigChange,
  type TenantConfigChangeAction,
  type TenantConfigTarget,
} from "../lib/org/tenant-config-change.js";
import {
  isSettlementStepUpEnabled,
  settlementAssuranceRequired,
} from "../lib/org/settlement-stepup.js";

function parseTarget(raw: string): TenantConfigTarget {
  if (raw === "standards" || raw === "modules" || raw === "agents") return raw;
  throw new Error(`--target must be standards, modules, or agents (got ${raw})`);
}

function parseAction(raw: string | undefined): TenantConfigChangeAction {
  if (!raw || raw === "set_enabled") return "set_enabled";
  if (raw === "import_enable") return "import_enable";
  throw new Error(`--action must be set_enabled or import_enable (got ${raw})`);
}

export function runTenantConfigPropose(opts: {
  target: string;
  id: string;
  enabled: boolean;
  message?: string;
  action?: string;
}): void {
  const auth = requireCliOperator({
    permission: "chat:ask",
    command: "tenant-config propose",
  });
  const action = parseAction(opts.action);
  const result = proposeTenantConfigChange({
    target: parseTarget(opts.target),
    targetId: opts.id,
    enabled: opts.enabled,
    proposedBy: auth.record.operator_id,
    message: opts.message,
    action,
  });
  console.log(`Proposed ${result.change.change_id}`);
  console.log(`  approval: ${result.approval_id}`);
  console.log(
    `  ${result.change.target} ${result.change.target_id}: ${result.change.from_enabled} → ${result.change.to_enabled}` +
      (action !== "set_enabled" ? ` (${action})` : "")
  );
  console.log(`  message: ${result.change.message}`);
  console.log(`Preview: orgos tenant-config preview --id ${result.approval_id}`);
  console.log(
    `Approve (CEO): orgos tenant-config approve --id ${result.approval_id} --reviewed`
  );
}

export function runTenantConfigList(opts?: { all?: boolean }): void {
  const file = loadTenantConfigChanges();
  const rows = opts?.all
    ? file.changes
    : file.changes.filter((c) => c.status === "pending_approval");
  if (rows.length === 0) {
    console.log(opts?.all ? "(no config changes)" : "(no pending config changes)");
    return;
  }
  console.log("| change_id | approval | target | id | from→to | status |");
  console.log("|-----------|----------|--------|----|---------|--------|");
  for (const c of rows) {
    console.log(
      `| ${c.change_id} | ${c.approval_id} | ${c.target} | ${c.target_id} | ${c.from_enabled}→${c.to_enabled} | ${c.status} |`
    );
  }
}

export function runTenantConfigPreview(opts: { id: string }): void {
  console.log(previewTenantConfigChange(opts.id).preview);
}

export function runTenantConfigApprove(opts: { id: string; reviewed?: boolean }): void {
  const auth = requireCliHumanApproval("tenant-config approve");
  if (!opts.reviewed) {
    const preview = previewTenantConfigChange(opts.id);
    console.error(preview.preview);
    console.error("");
    throw new Error(
      "Pass --reviewed after inspecting the preview (orgos tenant-config preview --id APR-...)"
    );
  }
  const approval = findOrgApproval(opts.id);
  if (approval && settlementAssuranceRequired(approval) && isSettlementStepUpEnabled()) {
    throw new Error(
      "This approval requires iPhone Settlement PassKey step-up. Use Operator Console /approvals/ (not CLI)."
    );
  }
  const result = approveAndApplyTenantConfigChange({
    approvalId: opts.id,
    approverId: auth.record.approver_name || auth.record.display_name,
    operatorId: auth.record.operator_id,
    reviewed: true,
  });
  console.log(`Approved ${result.approval.approval_id}`);
  console.log(
    `Applied ${result.change.change_id}: ${result.change.target_id} → ${result.change.to_enabled}`
  );
  if (result.warnings.length) {
    console.log("Warnings:");
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
}

/** Dev-only direct apply without approval (production rejected). */
export function runTenantConfigApplyDev(opts: { changeId: string }): void {
  if (process.env.ORGOS_ENV === "production" || process.env.ORGOS_PROD === "1") {
    throw new Error("Direct apply is disabled in production — use approve --reviewed");
  }
  const result = applyTenantConfigChange(opts.changeId);
  console.log(`Applied ${result.change.change_id} (dev)`);
  for (const w of result.warnings) console.log(`  warning: ${w}`);
}
