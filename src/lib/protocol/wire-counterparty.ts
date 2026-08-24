import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import type { WireTrustRegistryNode } from "../../../schemas/protocol/wire-trust-registry.js";
import { findPeer, loadPeersRegistry, peerHasDeliveryPath } from "./peers.js";
import {
  isWireReadyAdopter,
  loadWireTrustRegistry,
  resolveWireTrustNode,
} from "./wire-trust-registry.js";

export interface ResolveWireCounterpartyInput {
  /** Local peer_id (PEER-NNN) — preferred when already in peers.yaml. */
  peerId?: string;
  corporateNumber?: string;
  /** Counterparty OrgOS tenant_id from the OOO adopter directory. */
  counterpartyTenantId?: string;
}

export interface ResolvedWireCounterparty {
  peer?: PeerProfile;
  registry_node?: WireTrustRegistryNode;
  tenant_id?: string;
  wire_ready: boolean;
  matched_by: "peer_id" | "corporate_number" | "tenant_id" | "org_uri";
}

/**
 * Resolve a Wire counterparty from local peers.yaml and/or the OOO adopter directory.
 * Propose / Console should use the same resolver so PEER-* and tenant_id stay aligned.
 */
export function resolveWireCounterparty(
  input: ResolveWireCounterpartyInput
): ResolvedWireCounterparty | undefined {
  const peers = loadPeersRegistry().peers;
  const registry = loadWireTrustRegistry();

  if (input.peerId?.trim()) {
    const peer = findPeer(input.peerId.trim());
    if (!peer) return undefined;
    const tenantFromUri = peer.org_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
    const node =
      (tenantFromUri ? resolveWireTrustNode(tenantFromUri)?.node : undefined) ??
      (peer.did ? resolveWireTrustNode(peer.did)?.node : undefined) ??
      (peer.corporate_number
        ? registry.nodes.find((n) => n.corporate_number === peer.corporate_number)
        : undefined);
    return {
      peer,
      registry_node: node,
      tenant_id: node?.tenant_id ?? tenantFromUri,
      wire_ready: peerHasDeliveryPath(peer) && (!node || isWireReadyAdopter(node)),
      matched_by: "peer_id",
    };
  }

  if (input.counterpartyTenantId?.trim()) {
    const tenantId = input.counterpartyTenantId.trim();
    const resolved = resolveWireTrustNode(tenantId);
    const node = resolved?.node;
    const peer = peers.find(
      (p) =>
        p.org_uri === `steward://tenant/${tenantId}` ||
        (node?.did && p.did === node.did) ||
        (node?.corporate_number && p.corporate_number === node.corporate_number)
    );
    if (!peer && !node) return undefined;
    return {
      peer,
      registry_node: node,
      tenant_id: node?.tenant_id ?? tenantId,
      wire_ready: Boolean(
        (peer && peerHasDeliveryPath(peer)) || isWireReadyAdopter(node)
      ),
      matched_by: "tenant_id",
    };
  }

  if (input.corporateNumber?.trim()) {
    const corporateNumber = input.corporateNumber.replace(/\D/g, "");
    const peer = peers.find((p) => p.corporate_number === corporateNumber);
    const node = registry.nodes.find((n) => n.corporate_number === corporateNumber);
    if (!peer && !node) return undefined;
    return {
      peer,
      registry_node: node,
      tenant_id: node?.tenant_id,
      wire_ready: Boolean(
        (peer && peerHasDeliveryPath(peer)) || isWireReadyAdopter(node)
      ),
      matched_by: peer ? "corporate_number" : "corporate_number",
    };
  }

  return undefined;
}
