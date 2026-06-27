import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { OrgAuditAttestationKind } from "../../../schemas/org/audit-attestation.js";
import type { OperatorAttestation } from "../../../schemas/org/operator-attestation.js";
import { orgAuditAttestationPayloadSchema } from "../../../schemas/org/audit-attestation.js";
import { appendProtocolAuditRecord } from "../protocol/audit-chain.js";
import { ourOrgRef } from "../protocol/identity.js";
import { validateEnvelopeAgainstRegistry } from "../protocol/registry.js";
import { maybeSignEnvelope } from "../protocol/signing.js";

export function emitOrgAuditAttested(opts: {
  approval: OrgApprovalRequest;
  attestation: OperatorAttestation;
  kind: OrgAuditAttestationKind;
  transactionId?: string;
  wireEventId?: string;
}): EventEnvelope {
  const payload = orgAuditAttestationPayloadSchema.parse({
    scope: opts.approval.scope,
    kind: opts.kind,
    approval_id: opts.approval.approval_id,
    notice_id: opts.approval.scope === "wire" ? opts.approval.approval_id : undefined,
    subject_type: opts.approval.subject_type,
    subject_ref: opts.approval.subject_ref,
    operator_attestation: opts.attestation,
    transaction_id: opts.transactionId ?? opts.approval.wire?.transaction_id,
    transaction_type: opts.approval.wire?.transaction_type,
    wire_event_id: opts.wireEventId ?? opts.approval.wire?.wire_event_id,
  });

  const correlationId =
    opts.wireEventId ?? opts.approval.wire?.wire_event_id ?? opts.approval.approval_id;
  const now = new Date().toISOString();
  let envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: ourOrgRef(),
    correlation_id: correlationId,
    identity: { org_ref: ourOrgRef() },
    event: {
      type: "org.audit.attested",
      payload,
    },
    signature: null,
  };

  const issue = validateEnvelopeAgainstRegistry(envelope.event.type);
  if (issue) {
    throw new Error(issue);
  }

  envelope = maybeSignEnvelope(envelope);
  appendProtocolAuditRecord({
    envelope,
    transactionId: opts.transactionId ?? opts.approval.wire?.transaction_id,
  });
  return envelope;
}

/** Wire adapter helper — emits legacy kind for backward-compatible consumers. */
export function emitWireApprovalEnvelope(opts: {
  approval: OrgApprovalRequest;
  attestation: OperatorAttestation;
  wireEventId: string;
  transactionId: string;
}): EventEnvelope {
  return emitOrgAuditAttested({
    approval: opts.approval,
    attestation: opts.attestation,
    kind: "wire.approved",
    transactionId: opts.transactionId,
    wireEventId: opts.wireEventId,
  });
}
