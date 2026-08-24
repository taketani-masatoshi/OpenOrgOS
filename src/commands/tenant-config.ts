import { requireCliHumanApproval, requireCliOperator } from "../lib/console-auth/cli-operator.js";
import {
  applyTenantConfigChange,
  approveAndApplyTenantConfigChange,
  loadTenantConfigChanges,
  previewTenantConfigChange,
  proposeTenantConfigChange,
  type TenantConfigTarget,
} from "../lib/org/tenant-config-change.js";

function parseTarget(raw: string): TenantConfigTarget {
  if (raw === "standards" || raw === "modules") return raw;
  throw new Error(`--target must be standards or modules (got ${raw})`);
}

export function runTenantConfigPropose(opts: {
  target: string;
  id: string;
  enabled: boolean;
  message?: string;
}): void {
  const auth = requireCliOperator({
    permission: "chat:ask",
    command: "tenant-config propose",
  });
  const result = proposeTenantConfigChange({
    target: parseTarget(opts.target),
    targetId: opts.id,
    enabled: opts.enabled,
    proposedBy: auth.record.operator_id,
    message: opts.message,
  });
  console.log(`Proposed ${result.change.change_id}`);
  console.log(`  approval: ${result.approval_id}`);
  console.log(
    `  ${result.change.target} ${result.change.target_id}: ${result.change.from_enabled} → ${result.change.to_enabled}`
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
