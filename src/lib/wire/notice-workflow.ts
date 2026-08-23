import type {
  NoticeWireType,
  PendingNotice,
  PendingNoticesRegistry,
} from "../../../schemas/protocol/pending-notice.js";
import { loadContract } from "../data.js";
import { resolveWireCounterparty } from "../protocol/wire-counterparty.js";
import {
  recordProtocolTransaction,
  type RecordTransactionResult,
} from "../protocol/record-transaction.js";
import { getPendingNoticesPath } from "../protocol/paths.js";
import {
  humanApproveOrgApproval,
  completeOrgApprovalWire,
  findOrgApproval,
  listOrgApprovals,
  nextWireNoticeId,
  orgApprovalToPendingNotice,
  proposeOrgApproval,
  rejectOrgApproval,
} from "../org/approval/index.js";
import { resolveNoticeAmountForWire } from "./amount.js";
import { syncCompanyEventWireBindingAfterApprove } from "../company-events-wire.js";

export function loadPendingNotices(): PendingNoticesRegistry {
  const notices = listOrgApprovals({ scope: "wire" }).map(orgApprovalToPendingNotice);
  return { notices };
}

export function savePendingNotices(_registry: PendingNoticesRegistry): void {
  throw new Error(
    "savePendingNotices is deprecated — org approval registry is SoT at data/org/pending-approvals.yaml"
  );
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
  receiptId?: string;
  receiptDigest?: string;
  amount?: { value: number; currency: string };
  correlationEventId?: string;
  companyEventId?: string;
}

function contractMonthlyAmount(contractId: string): { value: number; currency: string } | undefined {
  const contract = loadContract(contractId);
  if (!contract) return undefined;
  const value = contract.compensation?.amount ?? contract.monthly_cost;
  if (value == null) return undefined;
  return { value, currency: "JPY" };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value.trim())) {
    throw new Error(
      `${label}はUUID形式で入力してください（例: 550e8400-e29b-41d4-a716-446655440000）`
    );
  }
}

function validateProposeOptions(opts: ProposeInterOrgWireOptions): void {
  // Shared resolver (peers.yaml + OOO adopter directory). Propose still accepts
  // local PEER-* entries; registry alignment is enforced by discover --doctor / Console register.
  const counterparty = resolveWireCounterparty({ peerId: opts.peerId });
  if (!counterparty?.peer) {
    throw new Error(`宛先ピア ${opts.peerId} は登録されていません`);
  }

  switch (opts.transactionType) {
    case "contract.execution.notice":
    case "contract.executed": {
      if (!opts.contractId?.trim()) {
        throw new Error(
          `契約IDが必要です（例: CTR-001）。種別「${opts.transactionType}」では締結済み契約を指定してください`
        );
      }
      const contract = loadContract(opts.contractId);
      if (!contract) {
        throw new Error(`契約 ${opts.contractId} が見つかりません`);
      }
      if (contract.status !== "executed") {
        throw new Error(
          `契約 ${opts.contractId} は締結済み（executed）である必要があります（現在: ${contract.status}）`
        );
      }
      break;
    }
    case "obligation.acknowledged": {
      if (!opts.correlationEventId?.trim()) {
        throw new Error(
          "関連イベントIDが必要です。受信トレイにある相手通知の event_id（UUID）を指定してください"
        );
      }
      assertUuid(opts.correlationEventId, "関連イベントID");
      break;
    }
    case "invoice.issued": {
      if (!opts.invoiceId?.trim()) {
        throw new Error("請求IDが必要です（例: INV-2026-001）");
      }
      break;
    }
    case "payment.instructed": {
      if (!opts.brokerInstruction?.trim()) {
        throw new Error("支払指示ID（broker_instruction）が必要です");
      }
      if (!opts.amount) {
        throw new Error("金額（amount.value と currency）が必要です");
      }
      break;
    }
    case "contract.void.requested": {
      if (!opts.correlationEventId?.trim()) {
        throw new Error(
          "関連イベントIDが必要です。対象Wire通知の event_id（UUID）を指定してください"
        );
      }
      assertUuid(opts.correlationEventId, "関連イベントID");
      if (!opts.companyEventId?.trim()) {
        throw new Error("会社イベントIDが必要です（例: EVT-2026-001）");
      }
      break;
    }
    case "receipt.claimed": {
      if (!opts.receiptId?.trim()) {
        throw new Error("領収書ID（receipt_id）が必要です");
      }
      if (!opts.receiptDigest?.trim()) {
        throw new Error("領収書 digest（receipt_digest）が必要です");
      }
      if (opts.amount != null) {
        throw new Error(
          "receipt.claimed に金額は載せられません（ADR 0032 · amount-free Wire claim）",
        );
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
    case "contract.void.requested":
      return `会社イベント ${opts.companyEventId} の void 許可依頼（元 Wire: ${opts.correlationEventId}）`;
    case "receipt.claimed":
      return `領収書 ${opts.receiptId} claim 確定 · digest ${opts.receiptDigest}`;
    default:
      return "Inter-org wire notice";
  }
}

export function proposeInterOrgWire(opts: ProposeInterOrgWireOptions): PendingNotice {
  validateProposeOptions(opts);

  const approval = proposeOrgApproval({
    scope: "wire",
    subjectType: opts.companyEventId ? "company.event" : "wire.outbound",
    subjectRef:
      opts.companyEventId ??
      opts.contractId ??
      opts.invoiceId ??
      opts.receiptId ??
      opts.correlationEventId,
    proposedBy: opts.proposedBy,
    message: opts.message ?? defaultMessage(opts),
    amount:
      opts.transactionType === "receipt.claimed"
        ? undefined
        : opts.amount ??
          (opts.contractId ? contractMonthlyAmount(opts.contractId) : undefined),
    useNoticeId: true,
    wire: {
      peerId: opts.peerId,
      transactionType: opts.transactionType,
      contractId: opts.contractId,
      invoiceId: opts.invoiceId,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholderId,
      receiptId: opts.receiptId,
      receiptDigest: opts.receiptDigest,
      correlationEventId: opts.correlationEventId,
      companyEventId: opts.companyEventId,
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
  settlementAssertion?: import("../../../schemas/org/settlement-stepup.js").SettlementWebAuthnAssertion & {
    challenge_id: string;
    token: string;
  };
}

export interface ApproveInterOrgNoticeResult {
  notice: PendingNotice;
  transmission: RecordTransactionResult;
  auditEnvelope: ReturnType<typeof completeOrgApprovalWire>["auditEnvelope"];
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
  const amount =
    notice.transaction_type === "receipt.claimed"
      ? undefined
      : resolveNoticeAmountForWire(notice);

  const { attestation } = humanApproveOrgApproval({
    approvalId: opts.noticeId,
    approverId: opts.approverId,
    coApproverId: opts.coApproverId,
    operatorId: opts.operatorId,
    source: "wire_ui",
    basis: attestationBasis(notice),
    basisRef:
      notice.contract_id ??
      notice.invoice_id ??
      notice.receipt_id ??
      notice.correlation_event_id,
    emitAudit: false,
    settlementAssertion: opts.settlementAssertion,
  });

  const transmission = recordProtocolTransaction({
    transactionType: notice.transaction_type,
    peerId: notice.peer_id,
    contractId: notice.contract_id,
    invoiceId: notice.invoice_id,
    brokerInstruction: notice.broker_instruction,
    stakeholderId: notice.stakeholder_id,
    receiptId: notice.receipt_id,
    receiptDigest: notice.receipt_digest,
    amount: notice.transaction_type === "receipt.claimed" ? undefined : notice.amount ?? amount,
    direction: "outbound",
    notes: notice.message,
    eventId: opts.eventId,
    correlationId: notice.correlation_event_id ?? notice.notice_id,
    operatorAttestation: attestation,
  });

  const { approval: completed, auditEnvelope } = completeOrgApprovalWire({
    approvalId: opts.noticeId,
    transactionId: transmission.transaction.transaction_id,
    wireEventId: transmission.envelope.event_id,
    attestation,
  });

  syncCompanyEventWireBindingAfterApprove(completed, transmission);

  return {
    notice: orgApprovalToPendingNotice(completed),
    transmission,
    auditEnvelope,
  };
}

export interface RejectInterOrgNoticeOptions {
  noticeId: string;
  approverId: string;
  reason?: string;
}

export function rejectInterOrgNotice(opts: RejectInterOrgNoticeOptions): PendingNotice {
  const { approval: rejected } = rejectOrgApproval({
    approvalId: opts.noticeId,
    approverId: opts.approverId,
    reason: opts.reason,
  });
  return orgApprovalToPendingNotice(rejected);
}

export function listPendingNotices(filter?: {
  status?: PendingNotice["status"];
}): PendingNotice[] {
  const statusMap: Record<
    PendingNotice["status"],
    import("../../../schemas/org/approval.js").OrgApprovalStatus | undefined
  > = {
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

/** Issuer confirms another OOO claimed a receipt — never include amount/lines. */
export function bridgeProposeReceiptClaimed(options: {
  peerId: string;
  receiptId: string;
  receiptDigest: string;
  proposedBy: string;
  correlationEventId?: string;
  message?: string;
}): PendingNotice {
  return proposeInterOrgWire({
    peerId: options.peerId,
    transactionType: "receipt.claimed",
    proposedBy: options.proposedBy,
    receiptId: options.receiptId,
    receiptDigest: options.receiptDigest,
    correlationEventId: options.correlationEventId,
    message: options.message,
  });
}

export { getPendingNoticesPath };
