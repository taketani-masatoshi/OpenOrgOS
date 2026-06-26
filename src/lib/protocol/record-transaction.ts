import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { TransactionRecord, TransactionType } from "../../../schemas/protocol/transaction-record.js";
import { transactionRecordSchema } from "../../../schemas/protocol/transaction-record.js";
import { loadContract } from "../data.js";
import { appendAuditEvent } from "../audit-log.js";
import { appendProtocolAuditRecord, writeOutboxEnvelope } from "./audit-chain.js";
import { ourOrgRef } from "./identity.js";
import { findPeer } from "./peers.js";
import { getProtocolOutboxDir } from "./paths.js";
import { validateEnvelopeAgainstRegistry } from "./registry.js";
import { appendTransaction, nextTransactionId } from "./transactions.js";
import type { OperatorAttestation } from "../../../schemas/protocol/operator-attestation.js";
import { operatorAttestationSchema } from "../../../schemas/protocol/operator-attestation.js";
import { maybeSignEnvelope } from "./signing.js";

export interface RecordTransactionOptions {
  transactionType: TransactionType;
  peerId: string;
  direction?: "outbound" | "inbound";
  contractId?: string;
  invoiceId?: string;
  stakeholderId?: string;
  brokerInstruction?: string;
  amount?: { value: number; currency: string };
  notes?: string;
  correlationId?: string;
  eventId?: string;
  writeOutbox?: boolean;
  /** Required for outbound wire unless operatorBypass (tests only). */
  operatorAttestation?: OperatorAttestation;
  /** @internal tests / seed only — never for production outbound */
  operatorBypass?: boolean;
}

export interface RecordTransactionResult {
  transaction: TransactionRecord;
  envelope: EventEnvelope;
  auditRecordId: string;
  outboxPath?: string;
}

function peerOrgRef(peerId: string): { org_id: string; org_uri?: string } {
  const peer = findPeer(peerId);
  if (!peer) {
    throw new Error(`Peer ${peerId} not found — register with steward protocol peer register`);
  }
  return { org_id: peer.peer_id, org_uri: peer.org_uri };
}

function resolveAmountFromContract(contractId: string): { value: number; currency: string } | undefined {
  const contract = loadContract(contractId);
  if (!contract) return undefined;
  const amount = contract.compensation?.amount ?? contract.monthly_cost;
  if (amount == null) return undefined;
  return { value: amount, currency: "JPY" };
}

export function recordProtocolTransaction(opts: RecordTransactionOptions): RecordTransactionResult {
  const peer = findPeer(opts.peerId);
  if (!peer) {
    throw new Error(`Peer ${opts.peerId} not found`);
  }

  const direction = opts.direction ?? "outbound";

  if (opts.contractId && direction === "outbound") {
    const requiresLocalContract =
      opts.transactionType === "contract.executed" ||
      opts.transactionType === "contract.execution.notice";
    if (requiresLocalContract) {
      const contract = loadContract(opts.contractId);
      if (!contract) {
        throw new Error(`Contract ${opts.contractId} not found`);
      }
      if (opts.transactionType === "contract.executed" && contract.status !== "executed") {
        throw new Error(`Contract ${opts.contractId} status is ${contract.status}, expected executed`);
      }
      if (opts.transactionType === "contract.execution.notice" && contract.status !== "executed") {
        throw new Error(
          `Execution notice requires executed contract ${opts.contractId} (status: ${contract.status})`
        );
      }
    }
  }

  if (
    direction === "outbound" &&
    !opts.operatorBypass &&
    !opts.operatorAttestation
  ) {
    throw new Error(
      "Outbound inter-org wire requires operator approval — use `steward protocol notice propose` then `notice approve` (Steward agents do not cross org boundaries)"
    );
  }

  const now = new Date().toISOString();
  const eventId = opts.eventId ?? randomUUID();
  const transactionId = nextTransactionId();
  const ourOrg = ourOrgRef();
  const counterparty = peerOrgRef(opts.peerId);

  const amount =
    opts.amount ??
    (opts.contractId ? resolveAmountFromContract(opts.contractId) : undefined);

  const refs = {
    contract_id: opts.contractId,
    invoice_id: opts.invoiceId,
    stakeholder_id: opts.stakeholderId ?? peer.stakeholder_id,
    broker_instruction: opts.brokerInstruction,
  };

  const payload: Record<string, unknown> = {
    transaction_id: transactionId,
    direction,
    transaction_type: opts.transactionType,
    counterparty: counterparty.org_id,
    refs,
  };
  if (amount) payload.amount = amount;
  if (opts.notes) payload.notes = opts.notes;
  if (opts.operatorAttestation) {
    payload.operator_attestation = operatorAttestationSchema.parse(opts.operatorAttestation);
    if (opts.transactionType === "contract.execution.notice") {
      payload.notice_kind = "per_existing_contract";
    }
  }

  let envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: eventId,
    occurred_at: now,
    origin: ourOrg,
    destination: counterparty,
    correlation_id: opts.correlationId ?? transactionId,
    identity: { org_ref: ourOrg },
    event: {
      type: "org.transaction.recorded",
      payload,
    },
    signature: null,
  };

  if (direction === "outbound" && opts.operatorAttestation) {
    envelope = maybeSignEnvelope(envelope);
  }

  const registryIssue = validateEnvelopeAgainstRegistry(envelope.event.type);
  if (registryIssue) {
    throw new Error(registryIssue);
  }

  const transaction = transactionRecordSchema.parse({
    transaction_id: transactionId,
    direction,
    our_org: ourOrg,
    counterparty,
    transaction_type: opts.transactionType,
    amount,
    refs,
    event_id: eventId,
    recorded_at: now,
    notes: opts.notes,
  });

  appendTransaction(transaction);
  const protocolAudit = appendProtocolAuditRecord({ envelope, transactionId });
  appendAuditEvent({
    event: "validate",
    ref: transactionId,
    detail: `protocol transaction ${opts.transactionType}`,
    event_id: eventId,
    transaction_id: transactionId,
  });

  let outboxPath: string | undefined;
  if (opts.writeOutbox !== false) {
    outboxPath = writeOutboxEnvelope(envelope, getProtocolOutboxDir());
  }

  return {
    transaction,
    envelope,
    auditRecordId: protocolAudit.audit_id,
    outboxPath,
  };
}

export {
  bridgeProposeContractExecuted as bridgeContractExecuted,
  bridgeProposeInvoiceIssued as bridgeInvoiceIssued,
  bridgeProposePaymentInstructed as bridgePaymentInstructed,
} from "./notice-workflow.js";
