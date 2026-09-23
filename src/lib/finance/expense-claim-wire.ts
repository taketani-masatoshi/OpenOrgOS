/**
 * Expense-claim Wire surface (receipt claim payload + issuer readiness).
 * Lifecycle approve/post stays in expense-claim.ts.
 */
import {
  isWireReadyAdopter,
  resolveWireTrustNode,
} from "../protocol/wire-trust-registry.js";
import { loadPeersRegistry } from "../protocol/peers.js";
import { loadTenantConfig } from "../tenant.js";

/** Resolve whether an issuer org is Wire-ready (Trust Registry first; peer hint only in test). */
export function resolveIssuerWireReady(orgId: string): {
  wire_ready: boolean;
  peer_id?: string;
  corporate_number?: string;
  display_name?: string;
} {
  const resolved = resolveWireTrustNode(orgId);
  if (resolved && isWireReadyAdopter(resolved.node)) {
    return {
      wire_ready: true,
      corporate_number: resolved.node.corporate_number,
      display_name: resolved.node.display_name,
    };
  }
  const peer = loadPeersRegistry().peers.find(
    (p) =>
      p.peer_id === orgId ||
      p.org_uri === `steward://tenant/${orgId}` ||
      p.did === `did:ooo:org:${orgId}` ||
      p.display_name === orgId,
  );
  // Production: Trust Registry only. Peer delivery is a test/dev hint.
  const peerHintAllowed =
    process.env.ORGOS_PEER_WIRE_READY === "1" ||
    loadTenantConfig().lifecycle === "test";
  if (peer) {
    const ready =
      peerHintAllowed &&
      Boolean(
        peer.inbound_webhook_url ||
          peer.inbound_endpoints?.length ||
          peer.wire_email,
      );
    return {
      wire_ready: ready,
      peer_id: peer.peer_id,
      corporate_number: peer.corporate_number,
      display_name: peer.display_name,
    };
  }
  return { wire_ready: false };
}

/** Wire claim payload: receipt_id + digest only (no amount / lines). */
export function buildReceiptWireClaimPayload(input: {
  receiptId: string;
  receiptDigest: string;
  claimKey?: string;
  issuerOrgId: string;
  claimantOrgId: string;
}): {
  event_type: "steward.receipt.claim.requested";
  payload: {
    receipt_id: string;
    receipt_digest: string;
    claim_key?: string;
  };
  origin_org_id: string;
  destination_org_id: string;
} {
  const body: {
    receipt_id: string;
    receipt_digest: string;
    claim_key?: string;
  } = {
    receipt_id: input.receiptId,
    receipt_digest: input.receiptDigest,
  };
  if (input.claimKey) body.claim_key = input.claimKey;
  // Guard: never attach amount fields
  const json = JSON.stringify(body);
  if (/"amount"|"total_amount"|"amount_yen"|"lines"/.test(json)) {
    throw new Error("Wire receipt claim must not include amount or lines");
  }
  return {
    event_type: "steward.receipt.claim.requested",
    payload: body,
    origin_org_id: input.claimantOrgId,
    destination_org_id: input.issuerOrgId,
  };
}
