import { existsSync } from "node:fs";
import {
  peersRegistrySchema,
  type PeerProfile,
  type PeersRegistry,
} from "../../../schemas/protocol/peers.js";
import type { PeerEndpoint } from "../../../schemas/protocol/peer-endpoint.js";
import { inferPeerTransport } from "../../../schemas/protocol/peer-endpoint.js";
import { getPeersYamlPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";

export function loadPeersRegistry(): PeersRegistry {
  const path = getPeersYamlPath();
  if (!existsSync(path)) {
    return { peers: [] };
  }
  return readYamlFile(path, peersRegistrySchema);
}

export function savePeersRegistry(registry: PeersRegistry): void {
  writeYamlFile(getPeersYamlPath(), { ...registry, as_of: currentDate() });
}

export function findPeer(peerId: string): PeerProfile | undefined {
  return loadPeersRegistry().peers.find((p) => p.peer_id === peerId);
}

export function registerPeer(profile: PeerProfile): PeerProfile {
  const registry = loadPeersRegistry();
  const existing = registry.peers.findIndex((p) => p.peer_id === profile.peer_id);
  if (existing >= 0) {
    registry.peers[existing] = profile;
  } else {
    registry.peers.push(profile);
  }
  savePeersRegistry(registry);
  return profile;
}

export function nextPeerId(): string {
  const registry = loadPeersRegistry();
  let max = 0;
  for (const p of registry.peers) {
    const n = Number(p.peer_id.replace("PEER-", ""));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `PEER-${String(max + 1).padStart(3, "0")}`;
}

/** Resolve delivery endpoints: explicit list or legacy single webhook URL. */
export function resolvePeerInboundEndpoints(peer: PeerProfile): PeerEndpoint[] {
  const raw: PeerEndpoint[] = [];
  if (peer.inbound_endpoints?.length) {
    raw.push(...peer.inbound_endpoints);
  } else if (peer.inbound_webhook_url) {
    raw.push({
      url: peer.inbound_webhook_url,
      priority: 1,
      mode: "push",
      transport: "legacy_webhook",
    });
  }
  return raw
    .map((ep) => ({
      ...ep,
      transport: inferPeerTransport(ep),
    }))
    .sort((a, b) => a.priority - b.priority);
}

export function peerHasDeliveryPath(peer: PeerProfile): boolean {
  return resolvePeerInboundEndpoints(peer).length > 0;
}

/** Base URL for peer outbox pull API (`/protocol/v1/outbox/{eventId}`). */
export function resolvePeerOutboxBaseUrl(peer: PeerProfile): string | undefined {
  const endpoints = resolvePeerInboundEndpoints(peer);
  const pull = endpoints.find((ep) => ep.mode === "pull");
  if (pull) {
    return pull.url.replace(/\/$/, "");
  }
  const fallback = endpoints[0]?.url ?? peer.inbound_webhook_url;
  if (!fallback) return undefined;
  const parsed = new URL(fallback);
  return `${parsed.protocol}//${parsed.host}`;
}
