import { approveOrgApproval, findOrgApproval } from "../org/approval/approve.js";
import { isCorrespondenceApprovalSubject } from "../correspondence/review.js";
import { getTenantId } from "../tenant.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import { isWireConsoleEnabled } from "../wire-console/tenant-registry.js";
import {
  approveTenantNotice,
  flushTenantWirePending,
} from "../wire-console/tenant-actions.js";

export interface ChatWireApproveResult {
  mode: "internal" | "wire";
  approval_id: string;
  flushed?: number;
  transmission?: {
    transaction_id?: string;
    event_id?: string;
    outbox_path?: string;
  };
  approval: unknown;
}

export async function approveFromStewardChat(
  approvalId: string,
  user: WireConsoleUser,
  opts?: { flush?: boolean }
): Promise<ChatWireApproveResult> {
  const tenantId = getTenantId();
  const pending = findOrgApproval(approvalId);
  if (!pending) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  if (pending.scope === "wire" && isWireConsoleEnabled(tenantId)) {
    const wire = await approveTenantNotice(tenantId, user, approvalId);
    let flushed = 0;
    if (opts?.flush !== false) {
      const flushResult = await flushTenantWirePending(tenantId);
      flushed = flushResult.flushed;
    }
    return {
      mode: "wire",
      approval_id: approvalId,
      flushed,
      transmission: wire.transmission,
      approval: wire.notice,
    };
  }

  if (isCorrespondenceApprovalSubject(pending.subject_type)) {
    throw new Error(
      `Correspondence approval ${approvalId} cannot be approved via Chat/MCP — ` +
        `human CEO must run: org approval approve --id ${approvalId} --approver "<name>" --reviewed`
    );
  }

  const result = approveOrgApproval({
    approvalId,
    approverId: user.approver_id,
    operatorId: user.operator_id,
  });
  return {
    mode: "internal",
    approval_id: approvalId,
    approval: result.approval,
  };
}

export async function flushWireDeliveryFromChat(): Promise<{ flushed: number }> {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return flushTenantWirePending(tenantId);
}
