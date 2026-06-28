import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import { appendProtocolAuditRecord, writeOutboxEnvelope } from "./audit-chain.js";
import { runWithProtocolWriteGuard } from "./protocol-write-guard.js";
import { ourOrgRef } from "./identity.js";
import { getProtocolOutboxDir } from "./paths.js";
import { validateEnvelopeAgainstRegistry } from "./registry.js";
import { maybeSignEnvelope } from "./signing.js";

function buildWitnessEnvelope(
  eventType: "org.witness.attestation.registered" | "org.witness.receipt.issued",
  payload: Record<string, unknown>,
  correlationId?: string
): EventEnvelope {
  const now = new Date().toISOString();
  let envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: ourOrgRef(),
    correlation_id: correlationId,
    identity: { org_ref: ourOrgRef() },
    event: { type: eventType, payload },
    signature: null,
  };

  const issue = validateEnvelopeAgainstRegistry(envelope.event.type);
  if (issue) {
    throw new Error(issue);
  }

  envelope = maybeSignEnvelope(envelope);
  appendProtocolAuditRecord({ envelope });
  runWithProtocolWriteGuard("witness-envelope-emit", () => {
    writeOutboxEnvelope(envelope, getProtocolOutboxDir());
  });
  return envelope;
}

export function emitWitnessAttestationRegistered(
  attestation: WitnessAttestation,
  hubId: string
): EventEnvelope {
  return buildWitnessEnvelope(
    "org.witness.attestation.registered",
    {
      witness_event_id: attestation.event_id,
      envelope_digest: attestation.envelope_digest,
      side: attestation.side,
      hub_id: hubId,
      attested_at: attestation.attested_at,
    },
    attestation.event_id
  );
}

export function emitWitnessReceiptIssued(receipt: WitnessReceipt): EventEnvelope {
  return buildWitnessEnvelope(
    "org.witness.receipt.issued",
    {
      witness_event_id: receipt.event_id,
      receipt_id: receipt.receipt_id,
      envelope_digest: receipt.envelope_digest,
      status: receipt.status,
      hub_id: receipt.hub_id,
      issued_at: receipt.issued_at,
    },
    receipt.event_id
  );
}
