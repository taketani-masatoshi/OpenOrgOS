import { existsSync } from "node:fs";
import {
  pendingNoticeSchema,
  pendingNoticesRegistrySchema,
  type NoticeWireType,
  type PendingNotice,
  type PendingNoticesRegistry,
} from "../../../schemas/protocol/pending-notice.js";
import type { OperatorAttestation } from "../../../schemas/protocol/operator-attestation.js";
import { loadContract } from "../data.js";
import {
  assertReg004Approval,
  resolveNoticeAmount,
  type Reg004Tier,
} from "./approval-policy.js";
import { getPendingNoticesPath } from "./paths.js";
import { findPeer } from "./peers.js";
import {
  recordProtocolTransaction,
  type RecordTransactionResult,
} from "./record-transaction.js";
import { emitReg004WireApprovalEnvelope } from "./internal-envelope-emit.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";

export function loadPendingNotices(): PendingNoticesRegistry {
  const path = getPendingNoticesPath();
  if (!existsSync(path)) {
    return { notices: [] };
  }
  return readYamlFile(path, pendingNoticesRegistrySchema);
}

export function savePendingNotices(registry: PendingNoticesRegistry): void {
  writeYamlFile(getPendingNoticesPath(), { ...registry, as_of: currentDate() });
}

export function findPendingNotice(noticeId: string): PendingNotice | undefined {
  return loadPendingNotices().notices.find((n) => n.notice_id === noticeId);
}

export function nextNoticeId(date = new Date()): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const prefix = `NOTICE-${ymd}-`;
  let max = 0;
  for (const n of loadPendingNotices().notices) {
    if (n.notice_id.startsWith(prefix)) {
      const num = Number(n.notice_id.slice(prefix.length));
      if (!Number.isNaN(num) && num > max) max = num;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
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

  const notice = pendingNoticeSchema.parse({
    notice_id: nextNoticeId(),
    status: "pending_approval",
    proposed_at: new Date().toISOString(),
    proposed_by: opts.proposedBy,
    peer_id: opts.peerId,
    transaction_type: opts.transactionType,
    contract_id: opts.contractId,
    invoice_id: opts.invoiceId,
    broker_instruction: opts.brokerInstruction,
    stakeholder_id: opts.stakeholderId,
    amount: opts.amount ?? (opts.contractId ? contractMonthlyAmount(opts.contractId) : undefined),
    correlation_event_id: opts.correlationEventId,
    message: opts.message ?? defaultMessage(opts),
  });

  const registry = loadPendingNotices();
  registry.notices.push(notice);
  savePendingNotices(registry);
  return notice;
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

function noticeAmountForReg004(notice: PendingNotice): { value: number; currency: string } {
  return resolveNoticeAmount(notice);
}

function attestationBasis(notice: PendingNotice): OperatorAttestation["basis"] {
  if (notice.transaction_type === "contract.executed") {
    return "new_contract_instrument";
  }
  return "existing_contract";
}

export function approveInterOrgNotice(
  opts: ApproveInterOrgNoticeOptions
): ApproveInterOrgNoticeResult {
  const registry = loadPendingNotices();
  const idx = registry.notices.findIndex((n) => n.notice_id === opts.noticeId);
  if (idx < 0) {
    throw new Error(`Notice ${opts.noticeId} not found`);
  }
  const notice = registry.notices[idx]!;
  if (notice.status !== "pending_approval") {
    throw new Error(`Notice ${opts.noticeId} status is ${notice.status}, expected pending_approval`);
  }

  const amount = noticeAmountForReg004(notice);
  const reg004 = assertReg004Approval({
    amount: amount.value,
    currency: amount.currency,
    approverId: opts.approverId,
    coApproverId: opts.coApproverId,
    policyRef: notice.approval_policy_ref,
  });

  const approvedAt = new Date().toISOString();
  const attestation: OperatorAttestation = {
    operator_id: opts.operatorId ?? notice.proposed_by,
    approver_id: opts.approverId,
    co_approver_id: opts.coApproverId,
    approval_tier: reg004.tier as Reg004Tier,
    approved_at: approvedAt,
    basis: attestationBasis(notice),
    basis_ref: notice.contract_id ?? notice.invoice_id ?? notice.correlation_event_id,
    notice_id: notice.notice_id,
    approval_policy_ref: reg004.policyRef,
  };

  const transmission = recordProtocolTransaction({
    transactionType: notice.transaction_type,
    peerId: notice.peer_id,
    contractId: notice.contract_id,
    invoiceId: notice.invoice_id,
    brokerInstruction: notice.broker_instruction,
    stakeholderId: notice.stakeholder_id,
    amount: notice.amount,
    direction: "outbound",
    notes: notice.message,
    eventId: opts.eventId,
    correlationId: notice.correlation_event_id ?? notice.notice_id,
    operatorAttestation: attestation,
  });

  registry.notices[idx] = {
    ...notice,
    status: "transmitted",
    approver_id: opts.approverId,
    co_approver_id: opts.coApproverId,
    approval_tier: reg004.tier,
    approved_at: approvedAt,
    transaction_id: transmission.transaction.transaction_id,
    event_id: transmission.envelope.event_id,
  };
  savePendingNotices(registry);

  emitReg004WireApprovalEnvelope({
    noticeId: notice.notice_id,
    attestation,
    wireEventId: transmission.envelope.event_id,
    transactionId: transmission.transaction.transaction_id,
    transactionType: notice.transaction_type,
  });

  return { notice: registry.notices[idx]!, transmission };
}

export interface RejectInterOrgNoticeOptions {
  noticeId: string;
  approverId: string;
  reason?: string;
}

export function rejectInterOrgNotice(opts: RejectInterOrgNoticeOptions): PendingNotice {
  const registry = loadPendingNotices();
  const idx = registry.notices.findIndex((n) => n.notice_id === opts.noticeId);
  if (idx < 0) {
    throw new Error(`Notice ${opts.noticeId} not found`);
  }
  const notice = registry.notices[idx]!;
  if (notice.status !== "pending_approval") {
    throw new Error(`Notice ${opts.noticeId} is not pending approval`);
  }
  registry.notices[idx] = {
    ...notice,
    status: "rejected",
    approver_id: opts.approverId,
    rejected_at: new Date().toISOString(),
    reject_reason: opts.reason,
  };
  savePendingNotices(registry);
  return registry.notices[idx]!;
}

export function listPendingNotices(filter?: {
  status?: PendingNotice["status"];
}): PendingNotice[] {
  return loadPendingNotices()
    .notices.filter((n) => (filter?.status ? n.status === filter.status : true))
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
