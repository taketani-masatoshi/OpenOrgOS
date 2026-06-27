import { existsSync } from "node:fs";
import {
  pendingNoticeSchema,
  type NoticeWireType,
  type PendingNotice,
  type PendingNoticesRegistry,
} from "../../../schemas/protocol/pending-notice.js";
import { loadContract } from "../data.js";
import { resolveNoticeAmountForWire } from "./wire-approval-gate.js";
import { findPeer } from "./peers.js";
import {
  recordProtocolTransaction,
  type RecordTransactionResult,
} from "./record-transaction.js";
import {
  approveOrgApproval,
  completeOrgApprovalWire,
  findOrgApproval,
  listOrgApprovals,
  nextWireNoticeId,
  orgApprovalToPendingNotice,
  proposeOrgApproval,
  rejectOrgApproval,
} from "../org/approval/index.js";
import { getPendingNoticesPath } from "./paths.js";

export function loadPendingNotices(): PendingNoticesRegistry {
  const notices = listOrgApprovals({ scope: "wire" }).map(orgApprovalToPendingNotice);
  return { notices };
}

export function savePendingNotices(_registry: PendingNoticesRegistry): void {
  throw new Error("savePendingNotices is deprecated — org approval registry is SoT at data/org/pending-approvals.yaml");
}

export function findPendingNotice(noticeId: string): PendingNotice | undefined {
  const approval = findOrgApproval(noticeId);
  if (!approval || approval.scope !== "wire") return undefined;
  return orgApprovalToPendingNotice(approval);
}

export function nextNoticeId(date = new Date()): string {
  return nextWireNoticeId(date);
}

export interface ProposeInterOrgWireOptions {
  peerId: string;
  transactionType: NoticeWireType;
  proposedBy: string;
  message?: string;
  contractId?: string;
  invoiceId?: string;
  brokerInstruction?: string;
  stakeholderId?: string;
  amount?: { value: number; currency: string };
  correlationEventId?: string;
}

function contractMonthlyAmount(contractId: string): { value: number; currency: string } | undefined {
  const contract = loadContract(contractId);
  if (!contract) return undefined;
  const value = contract.compensation?.amount ?? contract.monthly_cost;
  if (value == null) return undefined;
  return { value, currency: "JPY" };
}

function validateProposeOptions(opts: ProposeInterOrgWireOptions): void {
  if (!findPeer(opts.peerId)) {
    throw new Error(`Peer ${opts.peerId} not registered`);
  }

  switch (opts.transactionType) {
    case "contract.execution.notice":
    case "contract.executed": {
      if (!opts.contractId) {
        throw new Error(`contract_id required for ${opts.transactionType}`);
      }
      const contract = loadContract(opts.contractId);
      if (!contract) {
        throw new Error(`Contract ${opts.contractId} not found`);
      }
      if (contract.status !== "executed") {
        throw new Error(
          `Contract ${opts.contractId} must be executed (status: ${contract.status})`
        );
      }
      break;
    }
    case "obligation.acknowledged": {
      if (!opts.correlationEventId) {
        throw new Error("correlation_event_id required for obligation.acknowledged");
      }
      break;
    }
    case "invoice.issued": {
      if (!opts.invoiceId) {
        throw new Error("invoice_id required for invoice.issued");
      }
      break;
    }
    case "payment.instructed": {
      if (!opts.brokerInstruction) {
        throw new Error("broker_instruction required for payment.instructed");
      }
      if (!opts.amount) {
        throw new Error("amount required for payment.instructed");
      }
      break;
    }
    default:
      break;
  }
}

function defaultMessage(opts: ProposeInterOrgWireOptions): string {
  switch (opts.transactionType) {
    case "contract.execution.notice":
      return `契約 ${opts.contractId} に基づく実行・運用通知（既締結契約の範囲内）`;
    case "obligation.acknowledged":
      return `受信通知 ${opts.correlationEventId} を確認 · 契約範囲内で受諾`;
    case "invoice.issued":
      return `請求 ${opts.invoiceId} の発行通知`;
    case "payment.instructed":
      return `支払指示 ${opts.brokerInstruction}`;
    case "contract.executed":
      return `契約 ${opts.contractId} 締結の実行通知`;
    default:
      return "Inter-org wire notice";
  }
}

export function proposeInterOrgWire(opts: ProposeInterOrgWireOptions): PendingNotice {
  validateProposeOptions(opts);

  const approval = proposeOrgApproval({
    scope: "wire",
    subjectType: "wire.outbound",
    subjectRef: opts.contractId ?? opts.invoiceId ?? opts.correlationEventId,
    proposedBy: opts.proposedBy,
    message: opts.message ?? defaultMessage(opts),
    amount: opts.amount ?? (opts.contractId ? contractMonthlyAmount(opts.contractId) : undefined),
    useNoticeId: true,
    wire: {
      peerId: opts.peerId,
      transactionType: opts.transactionType,
      contractId: opts.contractId,
      invoiceId: opts.invoiceId,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholderId,
      correlationEventId: opts.correlationEventId,
    },
  });

  return orgApprovalToPendingNotice(approval);
}

export interface ProposeInterOrgNoticeOptions {
  peerId: string;
  contractId: string;
  proposedBy: string;
  message?: string;
}

export function proposeInterOrgNotice(opts: ProposeInterOrgNoticeOptions): PendingNotice {
  return proposeInterOrgWire({
    peerId: opts.peerId,
    transactionType: "contract.execution.notice",
    contractId: opts.contractId,
    proposedBy: opts.proposedBy,
    message: opts.message,
  });
}

export interface ProposeInterOrgAckOptions {
  peerId: string;
  proposedBy: string;
  correlationEventId: string;
  contractId?: string;
  message?: string;
}

export function proposeInterOrgAck(opts: ProposeInterOrgAckOptions): PendingNotice {
  return proposeInterOrgWire({
    peerId: opts.peerId,
    transactionType: "obligation.acknowledged",
    proposedBy: opts.proposedBy,
    correlationEventId: opts.correlationEventId,
    contractId: opts.contractId,
    message: opts.message,
  });
}

export interface ApproveInterOrgNoticeOptions {
  noticeId: string;
  approverId: string;
  coApproverId?: string;
  operatorId?: string;
  eventId?: string;
}

export interface ApproveInterOrgNoticeResult {
  notice: PendingNotice;
  transmission: RecordTransactionResult;
}

function attestationBasis(notice: PendingNotice): "existing_contract" | "new_contract_instrument" {
  if (notice.transaction_type === "contract.executed") {
    return "new_contract_instrument";
  }
  return "existing_contract";
}

export function approveInterOrgNotice(
  opts: ApproveInterOrgNoticeOptions
): ApproveInterOrgNoticeResult {
  const pending = listOrgApprovals({ scope: "wire" }).find((a) => a.approval_id === opts.noticeId);
  if (!pending) {
    throw new Error(`Notice ${opts.noticeId} not found`);
  }
  const notice = orgApprovalToPendingNotice(pending);
  const amount = resolveNoticeAmountForWire(notice);

  const { attestation } = approveOrgApproval({
    approvalId: opts.noticeId,
    approverId: opts.approverId,
    coApproverId: opts.coApproverId,
    operatorId: opts.operatorId,
    basis: attestationBasis(notice),
    basisRef: notice.contract_id ?? notice.invoice_id ?? notice.correlation_event_id,
    emitAudit: false,
  });

  const transmission = recordProtocolTransaction({
    transactionType: notice.transaction_type,
    peerId: notice.peer_id,
    contractId: notice.contract_id,
    invoiceId: notice.invoice_id,
    brokerInstruction: notice.broker_instruction,
    stakeholderId: notice.stakeholder_id,
    amount: notice.amount ?? amount,
    direction: "outbound",
    notes: notice.message,
    eventId: opts.eventId,
    correlationId: notice.correlation_event_id ?? notice.notice_id,
    operatorAttestation: attestation,
  });

  const completed = completeOrgApprovalWire({
    approvalId: opts.noticeId,
    transactionId: transmission.transaction.transaction_id,
    wireEventId: transmission.envelope.event_id,
    attestation,
  });

  return {
    notice: orgApprovalToPendingNotice(completed),
    transmission,
  };
}

export interface RejectInterOrgNoticeOptions {
  noticeId: string;
  approverId: string;
  reason?: string;
}

export function rejectInterOrgNotice(opts: RejectInterOrgNoticeOptions): PendingNotice {
  const rejected = rejectOrgApproval({
    approvalId: opts.noticeId,
    approverId: opts.approverId,
    reason: opts.reason,
  });
  return orgApprovalToPendingNotice(rejected);
}

export function listPendingNotices(filter?: {
  status?: PendingNotice["status"];
}): PendingNotice[] {
  const statusMap: Record<PendingNotice["status"], import("../../../schemas/org/approval.js").OrgApprovalStatus | undefined> = {
    pending_approval: "pending_approval",
    approved: "approved",
    rejected: "rejected",
    transmitted: "completed",
  };
  const orgStatus = filter?.status ? statusMap[filter.status] : undefined;
  return listOrgApprovals({ scope: "wire", status: orgStatus })
    .map(orgApprovalToPendingNotice)
    .sort((a, b) => a.proposed_at.localeCompare(b.proposed_at));
}

/** Bridge helpers — propose only; human approve required before wire. */
export function bridgeProposeContractExecuted(
  contractId: string,
  peerId: string,
  proposedBy: string
): PendingNotice {
  return proposeInterOrgWire({
    peerId,
    contractId,
    proposedBy,
    transactionType: "contract.executed",
  });
}

export function bridgeProposeInvoiceIssued(options: {
  peerId: string;
  invoiceId: string;
  proposedBy: string;
  amount?: { value: number; currency: string };
  message?: string;
}): PendingNotice {
  return proposeInterOrgWire({
    peerId: options.peerId,
    invoiceId: options.invoiceId,
    amount: options.amount,
    proposedBy: options.proposedBy,
    transactionType: "invoice.issued",
    message: options.message,
  });
}

export function bridgeProposePaymentInstructed(options: {
  peerId: string;
  brokerInstruction: string;
  proposedBy: string;
  amount: { value: number; currency: string };
  stakeholderId?: string;
  message?: string;
}): PendingNotice {
  return proposeInterOrgWire({
    peerId: options.peerId,
    brokerInstruction: options.brokerInstruction,
    amount: options.amount,
    stakeholderId: options.stakeholderId,
    proposedBy: options.proposedBy,
    transactionType: "payment.instructed",
    message: options.message,
  });
}

/** Legacy path accessor for migration tests. */
export { getPendingNoticesPath };
