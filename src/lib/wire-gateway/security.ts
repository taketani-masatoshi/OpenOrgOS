import type { WireMessage } from "../../../schemas/protocol/wire-message.js";
import type { InternalWirePeerEntry } from "../../../schemas/protocol/wire-gateway-internal.js";
import { nodeIdentifierMatches } from "../protocol/wire-trust-registry.js";
import { verifyEventEnvelopeSignature } from "../protocol/signing.js";
import {
  assertWireHashMatchesEnvelope,
  wireMessageToEnvelope,
} from "./codec.js";

export function checkTimestampSkew(timestamp: string, skewSec: number, now = new Date()): boolean {
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return false;
  const deltaMs = Math.abs(now.getTime() - ts);
  return deltaMs <= skewSec * 1000;
}

function peerMatchesSender(peer: InternalWirePeerEntry, sender: string): boolean {
  return nodeIdentifierMatches(sender, {
    peer_node_id: peer.peer_node_id,
    peer_node_uri: peer.peer_node_uri,
    peer_did: peer.peer_did,
  });
}

export function findPeerForSender(
  peers: InternalWirePeerEntry[],
  sender: string
): InternalWirePeerEntry | undefined {
  return peers.find((p) => peerMatchesSender(p, sender));
}

export interface InboundWireVerification {
  ok: boolean;
  reason?: string;
  peerNodeId?: string;
}

export function verifyInboundWireMessage(
  wire: WireMessage,
  peers: InternalWirePeerEntry[]
): InboundWireVerification {
  try {
    assertWireHashMatchesEnvelope(wire);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "hash_mismatch",
    };
  }

  const peer = findPeerForSender(peers, wire.sender);
  if (!peer) {
    return { ok: false, reason: "peer_unknown" };
  }

  if (!peer.protocol_public_key) {
    return { ok: false, reason: "peer_unknown", peerNodeId: peer.peer_node_id };
  }

  const envelope = wireMessageToEnvelope(wire);
  if (!verifyEventEnvelopeSignature(envelope, peer.protocol_public_key)) {
    return { ok: false, reason: "signature_invalid", peerNodeId: peer.peer_node_id };
  }

  return { ok: true, peerNodeId: peer.peer_node_id };
}
