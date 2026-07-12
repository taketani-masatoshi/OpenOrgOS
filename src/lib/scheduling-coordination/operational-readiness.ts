import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectMailSetupIssues } from "../correspondence/mail-setup-readiness.js";
import { ensureExecutiveMailConfig } from "../correspondence/ensure-mail-config.js";
import { getMailConfigPath } from "../correspondence/paths.js";
import { repairCorrespondenceApprovalRegistry } from "../correspondence/approval-registry-repair.js";
import { readOperatorKeyFromFile } from "../console-auth/cli-operator.js";
import { loadOperatorRegistry, verifyOperatorKey } from "../org/operators.js";
import { syncAndRepairOperatorKeys } from "../org/operator-keys.js";
import { getDataDir } from "../utils.js";
import { getTenantId } from "../tenant.js";

export interface OperationalReadinessIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  fix: string;
}

export interface OperationalReadinessReport {
  ready: boolean;
  issues: OperationalReadinessIssue[];
  repaired_approvals: string[];
  synced_operators: string[];
  rotated_operators: string[];
  next_command?: string;
}

function checkOperatorKeyAlignment(): OperationalReadinessIssue[] {
  const issues: OperationalReadinessIssue[] = [];
  const registry = loadOperatorRegistry();
  if (!registry?.operators.length) {
    issues.push({
      id: "operators_registry",
      severity: "warning",
      message: "operators.yaml 未初期化",
      fix: "orgos operator init-registry",
    });
    return issues;
  }

  for (const operator of registry.operators.filter(
    (row) => row.status === "active" && (row.role === "ceo" || row.role === "approver")
  )) {
    const key = readOperatorKeyFromFile(operator.operator_id);
    if (!key) {
      issues.push({
        id: `operator_key_file_${operator.operator_id}`,
        severity: "warning",
        message: `~/.orgos/operators/${operator.operator_id}.key 未作成`,
        fix: `orgos operator registry rotate-key --id ${operator.operator_id}`,
      });
      continue;
    }
    if (!verifyOperatorKey(operator.key_hash, key)) {
      issues.push({
        id: `operator_key_mismatch_${operator.operator_id}`,
        severity: "error",
        message: `${operator.operator_id} の key_hash がローカル key と不一致`,
        fix: `orgos operator registry rotate-key --id ${operator.operator_id} または orgos doctor --repair`,
      });
    }
  }
  return issues;
}

function checkSchedulingDataSkeleton(): OperationalReadinessIssue[] {
  const issues: OperationalReadinessIssue[] = [];
  const required = [
    "executive/scheduling-cases.yaml",
    "executive/calendar.yaml",
    "executive/ceo-inline-questions.yaml",
  ];
  for (const rel of required) {
    const path = join(getDataDir(), rel);
    if (!existsSync(path)) {
      issues.push({
        id: `scheduling_data_${rel.replace(/\//g, "_")}`,
        severity: "error",
        message: `data/${rel} 未作成`,
        fix: "orgos tenant scaffold-data",
      });
    }
  }
  return issues;
}

export function syncOperatorKeyHashesFromLocalFiles(): string[] {
  return syncAndRepairOperatorKeys({ allowRotate: false }).synced;
}

export { ensureOperatorAuthEnv, syncAndRepairOperatorKeys } from "../org/operator-keys.js";

export function collectOperationalReadinessIssues(opts?: {
  repairApprovals?: boolean;
  ensureMailConfig?: boolean;
  syncOperatorKeys?: boolean;
  repairOperatorKeys?: boolean;
}): OperationalReadinessReport {
  const issues: OperationalReadinessIssue[] = [];
  let repaired: string[] = [];
  let syncedOperators: string[] = [];
  let rotatedOperators: string[] = [];

  if (opts?.syncOperatorKeys || opts?.repairOperatorKeys) {
    const keyRepair = syncAndRepairOperatorKeys({
      allowRotate: Boolean(opts.repairOperatorKeys),
    });
    syncedOperators = keyRepair.synced;
    rotatedOperators = keyRepair.rotated;
  }

  if (opts?.ensureMailConfig) {
    const mailConfigPath = getMailConfigPath();
    if (!existsSync(mailConfigPath)) {
      ensureExecutiveMailConfig({ dryRunSmtp: true });
    } else {
      const mailErrors = collectMailSetupIssues("email").filter((i) => i.severity === "error");
      const repairable = mailErrors.some((e) =>
        ["from_placeholder", "provider_dry_run", "mail_config_file", "from_mismatch"].includes(e.id)
      );
      if (repairable) {
        ensureExecutiveMailConfig({ dryRunSmtp: true, force: true });
      }
    }
  }

  if (!existsSync(getMailConfigPath())) {
    issues.push({
      id: "mail_config_file",
      severity: "error",
      message: "records/executive/mail-config.yaml 未作成",
      fix: "orgos doctor --tenant <id> --repair または orgos tenant scaffold-data",
    });
  } else {
    for (const issue of collectMailSetupIssues("email")) {
      if (issue.severity === "error") {
        issues.push({
          id: issue.id,
          severity: "error",
          message: issue.message,
          fix: issue.fix,
        });
      }
    }
  }

  issues.push(...checkOperatorKeyAlignment());
  issues.push(...checkSchedulingDataSkeleton());

  if (opts?.repairApprovals) {
    repaired = repairCorrespondenceApprovalRegistry().repaired;
  }

  const ready = !issues.some((issue) => issue.severity === "error");
  const next_command = ready
    ? `orgos executive scheduling rehearsal --full --tenant ${getTenantId()}`
    : undefined;

  return {
    ready,
    issues,
    repaired_approvals: repaired,
    synced_operators: syncedOperators,
    rotated_operators: rotatedOperators,
    next_command,
  };
}
