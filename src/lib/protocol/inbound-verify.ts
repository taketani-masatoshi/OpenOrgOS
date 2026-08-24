import type { OrgRef } from "../../../schemas/protocol/org-event.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { operatorAttestationSchema } from "../../../schemas/protocol/operator-attestation.js";
import { loadPeersRegistry } from "./peers.js";
import {
  exportProtocolPublicKeyBase64,
  verifyEventEnvelopeSignature,
} from "./signing.js";
import { ourOrgRef } from "./identity.js";
import { getTenantId } from "../tenant.js";

export function findPeerByOrgRef(orgRef: OrgRef): PeerProfile | undefined {
  const peers = loadPeersRegistry().peers;

  if (orgRef.org_uri) {
    const exact = peers.find((p) => p.org_uri === orgRef.org_uri);
    if (exact) return exact;
  }

  const byDid = peers.find((p) => !!p.did && (p.did === orgRef.org_id || p.did === orgRef.org_uri));
  if (byDid) return byDid;

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

/** True when origin is this tenant (loopback notify / self-pull). */
export function isOurOrgRef(orgRef: OrgRef): boolean {
  const tenantId = getTenantId();
  if (orgRef.org_id === tenantId) return true;
  if (orgRef.org_uri === `steward://tenant/${tenantId}`) return true;
  try {
    const ours = ourOrgRef();
    if (orgRef.org_id === ours.org_id) return true;
    if (orgRef.org_uri && ours.org_uri && orgRef.org_uri === ours.org_uri) return true;
  } catch {
    /* tenant config incomplete in some fixtures */
  }
  return false;
}

export interface InboundEnvelopeVerification {
  ok: boolean;
  issues: string[];
}

export function verifyInboundProtocolEnvelope(
  envelope: EventEnvelope
): InboundEnvelopeVerification {
  const issues: string[] = [];
  const peer = findPeerByOrgRef(envelope.origin);
  // Loopback notify registers PEER-005 with our org_uri — still treat as self-origin
  // and verify with the local signing key (peer key may lag hygiene updates).
  const selfOrigin = isOurOrgRef(envelope.origin);
  const verifyKey = selfOrigin
    ? exportProtocolPublicKeyBase64() ?? peer?.protocol_public_key
    : peer?.protocol_public_key;

  if (!peer && !selfOrigin) {
    issues.push(`unknown origin org ${envelope.origin.org_id}`);
  } else if (verifyKey) {
    if (!envelope.signature) {
      issues.push(
        selfOrigin
          ? "missing signature from self-origin envelope"
          : `missing signature from peer ${peer!.peer_id}`
      );
    } else if (!verifyEventEnvelopeSignature(envelope, verifyKey)) {
      issues.push(
        selfOrigin
          ? "invalid signature on self-origin envelope"
          : `invalid signature from peer ${peer!.peer_id}`
      );
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
