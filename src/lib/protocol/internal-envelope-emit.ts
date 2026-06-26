import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { OperatorAttestation } from "../../../schemas/protocol/operator-attestation.js";
import { appendProtocolAuditRecord } from "./audit-chain.js";
import { ourOrgRef } from "./identity.js";
import { validateEnvelopeAgainstRegistry } from "./registry.js";
import { maybeSignEnvelope } from "./signing.js";

/** Internal-only REG-004 wire approval — audit-chain SoT, no outbox delivery. */
export function emitReg004WireApprovalEnvelope(opts: {
  noticeId: string;
  attestation: OperatorAttestation;
  wireEventId: string;
  transactionId: string;
  transactionType: string;
}): EventEnvelope {
  const now = new Date().toISOString();
  let envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: ourOrgRef(),
    correlation_id: opts.wireEventId,
    identity: { org_ref: ourOrgRef() },
    event: {
      type: "org.audit.attested",
      payload: {
        scope: "internal",
        kind: "reg004.wire.approved",
        notice_id: opts.noticeId,
        transaction_id: opts.transactionId,
        transaction_type: opts.transactionType,
        wire_event_id: opts.wireEventId,
        operator_attestation: opts.attestation,
      },
    },
    signature: null,
  };

  const issue = validateEnvelopeAgainstRegistry(envelope.event.type);
  if (issue) {
    throw new Error(issue);
  }

  envelope = maybeSignEnvelope(envelope);
  appendProtocolAuditRecord({ envelope, transactionId: opts.transactionId });
  return envelope;
}
