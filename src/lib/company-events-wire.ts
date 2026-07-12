import type { CompanyEvent } from "../../schemas/company-events.js";
import type { OrgApprovalRequest } from "../../schemas/org/approval.js";
import {
  isContractVoidAcknowledgedType,
  isContractVoidRequestedType,
} from "../../schemas/protocol/committee-transaction.js";
import { isWireDelivered } from "./protocol/wire-delivered.js";
import { findTransactionByEventId, loadTransactionsRegistry } from "./protocol/transactions.js";
import { listOrgApprovals } from "./org/approval/index.js";
import { proposeInterOrgWire } from "./wire/notice-workflow.js";
import type { RecordTransactionResult } from "./protocol/record-transaction.js";
import { findCompanyEventById, materializeCompanyEventsFromChain } from "./company-events.js";
import { appendChainLink } from "./company-events-chain.js";
import { getClock } from "./runtime-context.js";

export interface DeliveredWireExposure {
  peer_id: string;
  wire_event_id: string;
  notice_id?: string;
  void_request_notice_id?: string;
  void_ack_wire_event_id?: string;
}

export interface CompanyEventWireStatus {
  event_id: string;
  exposures: DeliveredWireExposure[];
  void_blocked: boolean;
  void_block_reason?: string;
  pending_void_request_notice_id?: string;
}

function approvalCompanyEventId(approval: OrgApprovalRequest): string | undefined {
  if (approval.scope !== "wire" || !approval.wire) return undefined;
  if (approval.wire.company_event_id) return approval.wire.company_event_id;
  if (approval.subject_type === "company.event" && approval.subject_ref) {
    return approval.subject_ref;
  }
  return undefined;
}

export function findWireApprovalsForCompanyEvent(eventId: string): OrgApprovalRequest[] {
  return listOrgApprovals({ scope: "wire" }).filter((a) => approvalCompanyEventId(a) === eventId);
}

function mergeExposure(map: Map<string, DeliveredWireExposure>, exp: DeliveredWireExposure): void {
  const key = `${exp.peer_id}:${exp.wire_event_id}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, exp);
    return;
  }
  map.set(key, {
    ...existing,
    ...exp,
    void_ack_wire_event_id: exp.void_ack_wire_event_id ?? existing.void_ack_wire_event_id,
    void_request_notice_id: exp.void_request_notice_id ?? existing.void_request_notice_id,
    notice_id: exp.notice_id ?? existing.notice_id,
  });
}

export function resolveDeliveredWireExposures(event: CompanyEvent): DeliveredWireExposure[] {
  const map = new Map<string, DeliveredWireExposure>();

  const binding = event.wire_binding;
  if (binding?.wire_event_id && binding.peer_id) {
    mergeExposure(map, {
      peer_id: binding.peer_id,
      wire_event_id: binding.wire_event_id,
      notice_id: binding.notice_id,
      void_request_notice_id: binding.void_request_notice_id,
      void_ack_wire_event_id: binding.void_ack_wire_event_id,
    });
  }

  for (const approval of findWireApprovalsForCompanyEvent(event.id)) {
    const wire = approval.wire;
    if (!wire?.wire_event_id || !wire.peer_id) continue;
    if (approval.status !== "completed") continue;
    if (isContractVoidRequestedType(wire.transaction_type)) {
      if (binding?.wire_event_id) {
        mergeExposure(map, {
          peer_id: binding.peer_id ?? wire.peer_id,
          wire_event_id: binding.wire_event_id,
          void_request_notice_id: approval.approval_id,
        });
      }
      continue;
    }
    mergeExposure(map, {
      peer_id: wire.peer_id,
      wire_event_id: wire.wire_event_id,
      notice_id: approval.approval_id,
      void_request_notice_id: binding?.void_request_notice_id,
      void_ack_wire_event_id: binding?.void_ack_wire_event_id,
    });
  }

  return [...map.values()];
}

function exposureIsDelivered(exp: DeliveredWireExposure, event: CompanyEvent): boolean {
  if (isWireDelivered(exp.peer_id, exp.wire_event_id)) return true;
  if (
    event.wire_binding?.status === "delivered" &&
    event.wire_binding.wire_event_id === exp.wire_event_id
  ) {
    return true;
  }
  const approval = findWireApprovalsForCompanyEvent(event.id).find(
    (a) =>
      a.status === "completed" &&
      a.wire?.wire_event_id === exp.wire_event_id &&
      !isContractVoidRequestedType(a.wire.transaction_type)
  );
  return Boolean(approval);
}
export function getCompanyEventWireStatus(eventId: string): CompanyEventWireStatus {
  const event = findCompanyEventById(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const exposures = resolveDeliveredWireExposures(event);
  const delivered = exposures.filter((exp) => exposureIsDelivered(exp, event));
  const blocking = delivered.filter((exp) => !exp.void_ack_wire_event_id);

  let void_block_reason: string | undefined;
  if (blocking.length > 0) {
    const first = blocking[0]!;
    void_block_reason = [
      `Wire-delivered event ${eventId} requires peer void acknowledgment before void.`,
      `  peer: ${first.peer_id}`,
      `  wire_event_id: ${first.wire_event_id}`,
      `  Next: orgos events void-request ${eventId} --operator <id>`,
      `        orgos events void-ack ${eventId} --wire-event <inbound-ack-uuid> --peer ${first.peer_id}`,
    ].join("\n");
  }

  return {
    event_id: eventId,
    exposures: delivered,
    void_blocked: blocking.length > 0,
    void_block_reason,
    pending_void_request_notice_id: event.wire_binding?.void_request_notice_id,
  };
}

export function assertCanVoidCompanyEvent(event: CompanyEvent): void {
  const status = getCompanyEventWireStatus(event.id);
  if (status.void_blocked) {
    throw new Error(status.void_block_reason ?? `Wire void gate blocked void for ${event.id}`);
  }
}

function patchCompanyEventWireBinding(
  eventId: string,
  patch: NonNullable<CompanyEvent["wire_binding"]>
): CompanyEvent {
  const current = findCompanyEventById(eventId);
  if (!current) {
    throw new Error(`Event not found: ${eventId}`);
  }
  const merged = {
    ...current.wire_binding,
    ...patch,
  };
  appendChainLink({
    action: "wire",
    event_id: eventId,
    wire_binding: merged,
  });
  const materialized = materializeCompanyEventsFromChain();
  const updated = materialized.registry.events.find((e) => e.id === eventId);
  if (!updated) {
    throw new Error(`Event missing after wire materialize: ${eventId}`);
  }
  return updated;
}

export function syncCompanyEventWireBindingAfterApprove(
  approval: OrgApprovalRequest,
  transmission: RecordTransactionResult
): CompanyEvent | undefined {
  const companyEventId = approvalCompanyEventId(approval);
  if (!companyEventId || !approval.wire) return undefined;

  const wireEventId = transmission.envelope.event_id;
  const peerId = approval.wire.peer_id;

  if (isContractVoidRequestedType(approval.wire.transaction_type)) {
    return patchCompanyEventWireBinding(companyEventId, {
      void_request_notice_id: approval.approval_id,
    });
  }

  return patchCompanyEventWireBinding(companyEventId, {
    notice_id: approval.approval_id,
    transaction_id: transmission.transaction.transaction_id,
    wire_event_id: wireEventId,
    peer_id: peerId,
    status: "delivered",
  });
}

export interface ProposeVoidWireForCompanyEventOptions {
  companyEventId: string;
  proposedBy: string;
  message?: string;
  peerId?: string;
}

export function proposeVoidWireForCompanyEvent(
  opts: ProposeVoidWireForCompanyEventOptions
): ReturnType<typeof proposeInterOrgWire> {
  const event = findCompanyEventById(opts.companyEventId);
  if (!event) {
    throw new Error(`Event not found: ${opts.companyEventId}`);
  }

  const exposures = resolveDeliveredWireExposures(event).filter((exp) =>
    exposureIsDelivered(exp, event)
  );
  if (exposures.length === 0) {
    throw new Error(
      `Event ${opts.companyEventId} has no wire-delivered exposure — void locally without void-request`
    );
  }

  const target =
    (opts.peerId ? exposures.find((e) => e.peer_id === opts.peerId) : undefined) ?? exposures[0]!;

  if (target.void_ack_wire_event_id) {
    throw new Error(`Void acknowledgment already registered for ${opts.companyEventId}`);
  }

  const notice = proposeInterOrgWire({
    peerId: target.peer_id,
    transactionType: "contract.void.requested",
    proposedBy: opts.proposedBy,
    correlationEventId: target.wire_event_id,
    companyEventId: opts.companyEventId,
    contractId: event.related?.contract_id,
    message:
      opts.message ??
      `社内会社イベント ${opts.companyEventId} の void 許可を依頼（元 Wire: ${target.wire_event_id}）`,
  });

  patchCompanyEventWireBinding(opts.companyEventId, {
    void_request_notice_id: notice.notice_id,
  });

  return notice;
}

export interface RegisterCompanyEventVoidAckOptions {
  companyEventId: string;
  wireEventId: string;
  peerId?: string;
}

export function registerCompanyEventVoidAck(
  opts: RegisterCompanyEventVoidAckOptions
): CompanyEvent {
  const event = findCompanyEventById(opts.companyEventId);
  if (!event) {
    throw new Error(`Event not found: ${opts.companyEventId}`);
  }

  const exposures = resolveDeliveredWireExposures(event).filter((exp) =>
    exposureIsDelivered(exp, event)
  );
  if (exposures.length === 0) {
    throw new Error(`Event ${opts.companyEventId} has no wire-delivered exposure`);
  }

  const peerId = opts.peerId ?? exposures[0]!.peer_id;
  const inbound = findTransactionByEventId(opts.wireEventId);
  if (inbound) {
    if (inbound.direction !== "inbound") {
      throw new Error(`Wire event ${opts.wireEventId} is not inbound`);
    }
    if (!isContractVoidAcknowledgedType(inbound.transaction_type)) {
      throw new Error(`Wire event ${opts.wireEventId} is not steward.contract.void.acknowledged`);
    }
  }

  const ackAt = getClock().nowIso();
  return patchCompanyEventWireBinding(opts.companyEventId, {
    void_ack_wire_event_id: opts.wireEventId,
    void_ack_at: ackAt,
    void_ack_peer_id: peerId,
  });
}

/** Scan inbound ledger for void.ack matching a delivered exposure correlation. */
export function tryAutoRegisterVoidAckFromInbound(
  companyEventId: string
): CompanyEvent | undefined {
  const event = findCompanyEventById(companyEventId);
  if (!event?.wire_binding?.wire_event_id) return undefined;
  if (event.wire_binding.void_ack_wire_event_id) return event;

  const originalWireId = event.wire_binding.wire_event_id;
  const registry = loadTransactionsRegistry();
  const ack = registry.transactions.find(
    (t) =>
      t.direction === "inbound" &&
      isContractVoidAcknowledgedType(t.transaction_type) &&
      t.notes?.includes(originalWireId)
  );
  if (!ack) return undefined;

  return registerCompanyEventVoidAck({
    companyEventId,
    wireEventId: ack.event_id,
    peerId: event.wire_binding.peer_id,
  });
}
