import { humanApproveOrgApproval, findOrgApproval } from "../org/approval/approve.js";
import {
  formatCorrespondenceDraftReview,
  isCorrespondenceApprovalSubject,
  loadCorrespondenceDraftForApproval,
} from "../correspondence/review.js";
import {
  listCorrespondenceDrafts,
  markCorrespondenceDraftApproved,
} from "../correspondence/draft.js";
import {
  approveAndApplyTenantConfigChange,
  isTenantConfigApprovalSubject,
  previewTenantConfigChange,
  rejectTenantConfigChange,
} from "../org/tenant-config-change.js";
import { isHumanApproverOperatorId } from "../correspondence/human-approval.js";
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
  approval_ids?: string[];
  flushed?: number;
  transmission?: {
    transaction_id?: string;
    event_id?: string;
    outbox_path?: string;
  };
  approval: unknown;
  config_change?: unknown;
  warnings?: string[];
}

function schedulingBatchKey(notes: string | undefined): string | undefined {
  if (!notes?.includes("scheduling-case:")) return undefined;
  const caseId = notes.match(/\bscheduling-case:(SCH-\d{4}-\d{3})\b/)?.[1];
  const kind = notes.match(/\bkind:(proposal|reminder|confirm)\b/)?.[1];
  const revision = notes.match(/\brevision:(\d+)\b/)?.[1];
  return caseId && kind && revision ? `${caseId}:${kind}:${revision}` : undefined;
}

function loadSchedulingApprovalBatch(approvalId: string) {
  const approval = findOrgApproval(approvalId);
  if (!approval || !isCorrespondenceApprovalSubject(approval.subject_type)) {
    throw new Error(`Scheduling correspondence approval ${approvalId} not found`);
  }
  const selected = loadCorrespondenceDraftForApproval(approval);
  const key = schedulingBatchKey(selected?.notes);
  if (!selected || !selected.notes?.includes("scheduling-case:")) {
    throw new Error(
      `Approval ${approvalId} is not scheduling correspondence and cannot be reviewed via Chat`
    );
  }
  const drafts = key
    ? listCorrespondenceDrafts({ channel: "email" })
        .filter((draft) => schedulingBatchKey(draft.notes) === key)
        .sort((a, b) => (a.to ?? "").localeCompare(b.to ?? ""))
    : [selected];
  return { selected, drafts };
}

export function loadSchedulingCorrespondencePreview(approvalId: string): {
  approval_id: string;
  draft_id: string;
  draft_ids: string[];
  preview: string;
} {
  const { selected, drafts } = loadSchedulingApprovalBatch(approvalId);
  return {
    approval_id: approvalId,
    draft_id: selected.draft_id,
    draft_ids: drafts.map((draft) => draft.draft_id),
    preview: drafts
      .map(
        (draft, index) =>
          `--- ${index + 1}/${drafts.length} ---\n${formatCorrespondenceDraftReview(draft)}`
      )
      .join("\n\n"),
  };
}

export async function approveFromStewardChat(
  approvalId: string,
  user: WireConsoleUser,
  opts?: {
    flush?: boolean;
    reviewed?: boolean;
    coApproverId?: string;
    settlementAssertion?: import("../../../schemas/org/settlement-stepup.js").SettlementWebAuthnAssertion & {
      challenge_id: string;
      token: string;
    };
  }
): Promise<ChatWireApproveResult> {
  if (!isHumanApproverOperatorId(user.operator_id)) {
    throw new Error(
      `approval requires ceo or approver operator (got ${user.operator_id}). Agents cannot approve.`
    );
  }
  const tenantId = getTenantId();
  const pending = findOrgApproval(approvalId);
  if (!pending) {
    throw new Error(`Approval ${approvalId} not found`);
  }

  if (pending.scope === "wire" && isWireConsoleEnabled(tenantId)) {
    const wire = await approveTenantNotice(tenantId, user, approvalId, {
      co_approver_id: opts?.coApproverId,
      settlementAssertion: opts?.settlementAssertion,
    });
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
    const review = loadSchedulingCorrespondencePreview(approvalId);
    if (opts?.reviewed !== true) {
      throw new Error(
        `Scheduling correspondence approval ${approvalId} requires the full preview and reviewed=true`
      );
    }
    const results = review.draft_ids.map((draftId) => {
      const draft = listCorrespondenceDrafts({ channel: "email" }).find(
        (candidate) => candidate.draft_id === draftId
      );
      if (!draft?.approval_id) {
        throw new Error(`Scheduling draft ${draftId} has no approval`);
      }
      const approval = findOrgApproval(draft.approval_id);
      if (approval?.status === "approved" || approval?.status === "completed") {
        return { approval: approval };
      }
      const result = humanApproveOrgApproval({
        approvalId: draft.approval_id,
        approverId: user.approver_id,
        operatorId: user.operator_id,
        source: "chat_ui",
        humanReviewConfirmed: true,
        settlementAssertion: opts?.settlementAssertion,
      });
      markCorrespondenceDraftApproved(draftId);
      return result;
    });
    return {
      mode: "internal",
      approval_id: approvalId,
      approval_ids: review.draft_ids
        .map(
          (draftId) =>
            listCorrespondenceDrafts({ channel: "email" }).find(
              (candidate) => candidate.draft_id === draftId
            )?.approval_id
        )
        .filter((id): id is string => Boolean(id)),
      approval: results.find((result) => result.approval.approval_id === approvalId)?.approval ??
        results[0]?.approval,
    };
  }

  if (isTenantConfigApprovalSubject(pending.subject_type)) {
    if (!isHumanApproverOperatorId(user.operator_id)) {
      throw new Error(
        `tenant.config approval requires ceo/approver operator (got ${user.operator_id})`
      );
    }
    const result = approveAndApplyTenantConfigChange({
      approvalId,
      approverId: user.approver_id,
      operatorId: user.operator_id,
      reviewed: opts?.reviewed === true,
    });
    return {
      mode: "internal",
      approval_id: approvalId,
      approval: result.approval,
      config_change: result.change,
      warnings: result.warnings,
    };
  }

  const result = humanApproveOrgApproval({
    approvalId,
    approverId: user.approver_id,
    operatorId: user.operator_id,
    source: "chat_ui",
    coApproverId: opts?.coApproverId,
    settlementAssertion: opts?.settlementAssertion,
  });
  return {
    mode: "internal",
    approval_id: approvalId,
    approval: result.approval,
  };
}

export function loadTenantConfigApprovalPreview(approvalId: string) {
  return previewTenantConfigChange(approvalId);
}

export function rejectTenantConfigFromStewardChat(
  approvalId: string,
  user: WireConsoleUser,
  reason?: string
) {
  if (!isHumanApproverOperatorId(user.operator_id)) {
    throw new Error(
      `tenant.config reject requires ceo/approver operator (got ${user.operator_id})`
    );
  }
  const pending = findOrgApproval(approvalId);
  if (!pending || !isTenantConfigApprovalSubject(pending.subject_type)) {
    throw new Error(`tenant.config approval ${approvalId} not found`);
  }
  return rejectTenantConfigChange({
    approvalId,
    approverId: user.approver_id,
    reason,
  });
}

export async function flushWireDeliveryFromChat(): Promise<{ flushed: number }> {
  const tenantId = getTenantId();
  if (!isWireConsoleEnabled(tenantId)) {
    throw new Error(`Tenant ${tenantId} does not have wire_console enabled`);
  }
  return flushTenantWirePending(tenantId);
}
