import type { OrgRef } from "../../../schemas/protocol/org-event.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { operatorAttestationSchema } from "../../../schemas/protocol/operator-attestation.js";
import { loadPeersRegistry } from "./peers.js";
import { verifyEventEnvelopeSignature } from "./signing.js";

export function findPeerByOrgRef(orgRef: OrgRef): PeerProfile | undefined {
  const peers = loadPeersRegistry().peers;

  if (orgRef.org_uri) {
    const exact = peers.find((p) => p.org_uri === orgRef.org_uri);
    if (exact) return exact;
  }

  const tenantFromUri = orgRef.org_uri?.match(/^steward:\/\/tenant\/([^/]+)$/);
  if (tenantFromUri) {
    const tenantId = tenantFromUri[1];
    const byTenant = peers.find(
      (p) => p.org_uri === `steward://tenant/${tenantId}` || p.org_uri?.endsWith(`/${tenantId}`)
    );
    if (byTenant) return byTenant;
  }

  if (orgRef.org_id.startsWith("PEER-")) {
    return peers.find((p) => p.peer_id === orgRef.org_id);
  }

  return peers.find(
    (p) => p.org_uri === `steward://tenant/${orgRef.org_id}` || p.org_uri?.includes(orgRef.org_id)
  );
}

export interface InboundEnvelopeVerification {
  ok: boolean;
  issues: string[];
}

export function verifyInboundProtocolEnvelope(envelope: EventEnvelope): InboundEnvelopeVerification {
  const issues: string[] = [];
  const peer = findPeerByOrgRef(envelope.origin);

  if (!peer) {
    issues.push(`unknown origin org ${envelope.origin.org_id}`);
  } else if (peer.protocol_public_key) {
    if (!envelope.signature) {
      issues.push(`missing signature from peer ${peer.peer_id}`);
    } else if (!verifyEventEnvelopeSignature(envelope, peer.protocol_public_key)) {
      issues.push(`invalid signature from peer ${peer.peer_id}`);
    }
  }

  if (envelope.event.type === "org.transaction.recorded") {
    const payload = envelope.event.payload;
    const attestation = payload.operator_attestation;
    if (payload.direction === "outbound" && !attestation) {
      issues.push("missing operator_attestation on inter-org wire envelope");
    }
    if (attestation) {
      const parsed = operatorAttestationSchema.safeParse(attestation);
      if (!parsed.success) {
        issues.push("invalid operator_attestation on inbound payload");
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
