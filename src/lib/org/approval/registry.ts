import { existsSync } from "node:fs";
import {
  orgApprovalRegistrySchema,
  orgApprovalRequestSchema,
  type OrgApprovalRegistry,
  type OrgApprovalRequest,
} from "../../../../schemas/org/approval.js";
import {
  pendingNoticesRegistrySchema,
  type PendingNotice,
} from "../../../../schemas/protocol/pending-notice.js";
import { getPendingApprovalsPath } from "../paths.js";
import { getPendingNoticesPath } from "../../protocol/paths.js";
import { currentDate, readYamlFile } from "../../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../../yaml-atomic.js";
import { resolveJurisdictionApprovalPolicy } from "../../jurisdiction/wire-governance/index.js";

/** Nestable exclusive section for load → mutate → save of pending-approvals. */
let orgApprovalLockDepth = 0;

export function withOrgApprovalRegistryLock<T>(fn: () => T): T {
  if (orgApprovalLockDepth > 0) return fn();
  return withYamlFileLock(getPendingApprovalsPath(), () => {
    orgApprovalLockDepth += 1;
    try {
      return fn();
    } finally {
      orgApprovalLockDepth -= 1;
    }
  });
}

export function noticeToOrgApproval(notice: PendingNotice): OrgApprovalRequest {
  return orgApprovalRequestSchema.parse({
    approval_id: notice.notice_id,
    scope: "wire",
    status: notice.status === "transmitted" ? "completed" : notice.status,
    proposed_at: notice.proposed_at,
    proposed_by: notice.proposed_by,
    subject_type: "wire.outbound",
    subject_ref:
      notice.contract_id ??
      notice.invoice_id ??
      notice.receipt_id ??
      notice.correlation_event_id,
    amount: notice.amount,
    message: notice.message,
    approval_policy_ref: notice.approval_policy_ref,
    approval_tier: notice.approval_tier,
    approver_id: notice.approver_id,
    co_approver_id: notice.co_approver_id,
    approved_at: notice.approved_at,
    rejected_at: notice.rejected_at,
    reject_reason: notice.reject_reason,
    audit_event_id: notice.event_id,
    wire: {
      peer_id: notice.peer_id,
      transaction_type: notice.transaction_type,
      contract_id: notice.contract_id,
      invoice_id: notice.invoice_id,
      broker_instruction: notice.broker_instruction,
      stakeholder_id: notice.stakeholder_id,
      receipt_id: notice.receipt_id,
      receipt_digest: notice.receipt_digest,
      correlation_event_id: notice.correlation_event_id,
      transaction_id: notice.transaction_id,
      wire_event_id: notice.event_id,
    },
  });
}

export function orgApprovalToPendingNotice(approval: OrgApprovalRequest): PendingNotice {
  if (approval.scope !== "wire" || !approval.wire) {
    throw new Error(`Approval ${approval.approval_id} is not a wire outbound request`);
  }
  const w = approval.wire;
  return {
    notice_id: approval.approval_id as PendingNotice["notice_id"],
    status:
      approval.status === "completed"
        ? "transmitted"
        : approval.status === "approved"
          ? "approved"
          : approval.status,
    proposed_at: approval.proposed_at,
    proposed_by: approval.proposed_by,
    peer_id: w.peer_id,
    transaction_type: w.transaction_type,
    contract_id: w.contract_id,
    invoice_id: w.invoice_id,
    broker_instruction: w.broker_instruction,
    stakeholder_id: w.stakeholder_id,
    receipt_id: w.receipt_id,
    receipt_digest: w.receipt_digest,
    amount: approval.amount,
    correlation_event_id: w.correlation_event_id,
    message: approval.message,
    approver_id: approval.approver_id,
    co_approver_id: approval.co_approver_id,
    approved_at: approval.approved_at,
    approval_policy_ref: approval.approval_policy_ref,
    approval_tier: approval.approval_tier,
    transaction_id: w.transaction_id,
    event_id: w.wire_event_id ?? approval.audit_event_id,
    rejected_at: approval.rejected_at,
    reject_reason: approval.reject_reason,
  };
}

function migrateLegacyPendingNotices(): OrgApprovalRegistry {
  const legacyPath = getPendingNoticesPath();
  if (!existsSync(legacyPath)) {
    return { approvals: [] };
  }
  const legacy = readYamlFile(legacyPath, pendingNoticesRegistrySchema);
  return {
    approvals: legacy.notices.map(noticeToOrgApproval),
  };
}

export function loadOrgApprovalRegistry(): OrgApprovalRegistry {
  const path = getPendingApprovalsPath();
  if (existsSync(path)) {
    return readYamlFile(path, orgApprovalRegistrySchema);
  }
  const migrated = migrateLegacyPendingNotices();
  if (migrated.approvals.length > 0) {
    saveOrgApprovalRegistry(migrated);
  }
  return migrated;
}

export function saveOrgApprovalRegistry(registry: OrgApprovalRegistry): void {
  const path = getPendingApprovalsPath();
  const parsed = orgApprovalRegistrySchema.parse({
    ...registry,
    as_of: currentDate(),
  });
  const write = (): void => {
    writeYamlFileAtomic(path, parsed);
  };
  if (orgApprovalLockDepth > 0) {
    write();
    return;
  }
  withYamlFileLock(path, write);
}

export function findOrgApproval(approvalId: string): OrgApprovalRequest | undefined {
  return loadOrgApprovalRegistry().approvals.find((a) => a.approval_id === approvalId);
}

export function nextApprovalId(date = new Date(), prefix: "APR" | "NOTICE" = "APR"): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const idPrefix = `${prefix}-${ymd}-`;
  let max = 0;
  for (const a of loadOrgApprovalRegistry().approvals) {
    if (a.approval_id.startsWith(idPrefix)) {
      const num = Number(a.approval_id.slice(idPrefix.length));
      if (!Number.isNaN(num) && num > max) max = num;
    }
  }
  return `${idPrefix}${String(max + 1).padStart(3, "0")}`;
}

export function nextWireNoticeId(date = new Date()): string {
  return nextApprovalId(date, "NOTICE") as OrgApprovalRequest["approval_id"];
}

export function defaultApprovalPolicyRef(): string {
  return resolveJurisdictionApprovalPolicy().policy_ref;
}
