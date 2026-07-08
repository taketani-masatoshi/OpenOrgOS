import type { NoticeWireType } from "../../../schemas/protocol/pending-notice.js";
import type { WitnessAttestationSide } from "../../../schemas/protocol/witness-attestation.js";
import {
  approveInterOrgNotice,
  proposeInterOrgWire,
  rejectInterOrgNotice,
} from "../wire/notice-workflow.js";
import { transmitApprovedNotice } from "../protocol/notice-transmit.js";
import {
  deliverProtocolEnvelopeWithRelay,
  flushWirePending,
} from "../protocol/transport.js";
import {
  findEnvelopeFileForWitness,
  flushWitnessPending,
  registerWitnessAttestationFanOut,
  verifyCachedReceiptsForEvent,
  fetchReceiptsFromPool,
} from "../protocol/witness-client.js";
import type { WireConsoleUser } from "./auth/session.js";
import { withWireConsoleTenantAsync } from "./tenant-context.js";

export interface ProposeNoticeInput {
  peer_id: string;
  transaction_type: NoticeWireType;
  contract_id?: string;
  correlation_event_id?: string;
  invoice_id?: string;
  broker_instruction?: string;
  stakeholder_id?: string;
  amount?: { value: number; currency: string };
  message?: string;
}

export async function proposeTenantNotice(
  tenantId: string,
  user: WireConsoleUser,
  input: ProposeNoticeInput
) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const notice = proposeInterOrgWire({
      peerId: input.peer_id,
      transactionType: input.transaction_type,
      proposedBy: user.operator_id,
      contractId: input.contract_id,
      correlationEventId: input.correlation_event_id,
      invoiceId: input.invoice_id,
      brokerInstruction: input.broker_instruction,
      stakeholderId: input.stakeholder_id,
      amount: input.amount,
      message: input.message,
    });
    return { notice };
  });
}

export async function approveTenantNotice(
  tenantId: string,
  user: WireConsoleUser,
  noticeId: string,
  opts?: { co_approver_id?: string }
) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const result = approveInterOrgNotice({
      noticeId,
      approverId: user.approver_id,
      coApproverId: opts?.co_approver_id,
      operatorId: user.operator_id,
    });
    const transmit = await transmitApprovedNotice(result);
    return {
      notice: result.notice,
      transmission: {
        transaction_id: result.transmission.transaction.transaction_id,
        event_id: result.transmission.envelope.event_id,
        outbox_path: result.transmission.outboxPath,
      },
      transmit: {
        pool_bind: transmit.poolBind,
        delivery: transmit.delivery,
        witness: transmit.witness
          ? {
              succeeded: transmit.witness.succeeded,
              failed: transmit.witness.failed,
              quorum: transmit.witness.quorum,
            }
          : null,
        wire_governance_witness: transmit.wireGovernanceWitness,
      },
    };
  });
}

export async function rejectTenantNotice(
  tenantId: string,
  user: WireConsoleUser,
  noticeId: string,
  reason?: string
) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const notice = rejectInterOrgNotice({
      noticeId,
      approverId: user.approver_id,
      reason,
    });
    return { notice };
  });
}

export async function deliverTenantEnvelope(
  tenantId: string,
  peerId: string,
  eventId: string
) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const envelope = findEnvelopeFileForWitness(eventId);
    if (!envelope) {
      throw new Error(`Envelope not found for event_id ${eventId}`);
    }
    const delivery = await deliverProtocolEnvelopeWithRelay(envelope, peerId);
    return { delivery };
  });
}

export async function flushTenantWirePending(tenantId: string) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const flushed = await flushWirePending();
    return { flushed };
  });
}

export async function registerTenantWitness(
  tenantId: string,
  eventId: string,
  side: WitnessAttestationSide
) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const envelope = findEnvelopeFileForWitness(eventId);
    if (!envelope) {
      throw new Error(`Envelope not found for event_id ${eventId}`);
    }
    const result = await registerWitnessAttestationFanOut({ envelope, side });
    if (!result) {
      throw new Error("Witness pool disabled or empty");
    }
    return {
      succeeded: result.succeeded,
      failed: result.failed,
      quorum: result.quorum,
      receipt_count: result.receipts.length,
    };
  });
}

export async function flushTenantWitnessPending(tenantId: string) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    const flushed = await flushWitnessPending();
    return { flushed };
  });
}

export async function verifyTenantWitness(tenantId: string, eventId: string) {
  return withWireConsoleTenantAsync(tenantId, async () => {
    await fetchReceiptsFromPool(eventId);
    const result = verifyCachedReceiptsForEvent(eventId);
    return {
      event_id: eventId,
      receipts: result.receipts.map((r) => ({
        hub_id: r.hub_id,
        event_id: r.event_id,
        status: r.status,
      })),
      quorum: result.quorum,
      issues: result.issues,
    };
  });
}
