import { loadPeersRegistry, savePeersRegistry } from "./peers.js";
import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { inferPeerTransport } from "../../../schemas/protocol/peer-endpoint.js";

export interface MigrateLegacyPeerResult {
  peer_id: string;
  status: "migrated" | "skipped" | "unchanged";
  detail?: string;
}

export interface MigrateLegacyPeersOptions {
  apply?: boolean;
  toWireUrl?: string;
}

function hasOnlyLegacyWebhook(peer: PeerProfile): boolean {
  if (peer.inbound_endpoints?.length) {
    return peer.inbound_endpoints.every(
      (ep) => inferPeerTransport(ep) === "legacy_webhook"
    );
  }
  return Boolean(peer.inbound_webhook_url);
}

/** Detect / rewrite legacy webhook peers into inbound_endpoints. */
export function migrateLegacyWebhookPeers(
  opts: MigrateLegacyPeersOptions = {}
): { results: MigrateLegacyPeerResult[]; apply: boolean } {
  const registry = loadPeersRegistry();
  const results: MigrateLegacyPeerResult[] = [];
  let changed = false;

  for (const peer of registry.peers) {
    if (!hasOnlyLegacyWebhook(peer) && !peer.inbound_webhook_url) {
      results.push({
        peer_id: peer.peer_id,
        status: "skipped",
        detail: "no legacy webhook",
      });
      continue;
    }

    if (!hasOnlyLegacyWebhook(peer) && peer.inbound_endpoints?.length) {
      const hasWire = peer.inbound_endpoints.some(
        (ep) => inferPeerTransport(ep) === "wire_v1"
      );
      if (hasWire && !peer.inbound_webhook_url) {
        results.push({ peer_id: peer.peer_id, status: "unchanged", detail: "already wire_v1" });
        continue;
      }
    }

    const fromUrl =
      opts.toWireUrl ??
      peer.inbound_webhook_url ??
      peer.inbound_endpoints?.[0]?.url;

    if (!fromUrl) {
      results.push({
        peer_id: peer.peer_id,
        status: "skipped",
        detail: "no URL to migrate",
      });
      continue;
    }

    const transport = opts.toWireUrl ? "wire_v1" : "legacy_webhook";
    const nextEndpoints = [
      {
        url: fromUrl,
        priority: 1 as const,
        mode: "push" as const,
        transport: transport as "wire_v1" | "legacy_webhook",
      },
      ...(peer.inbound_endpoints ?? []).filter(
        (ep) => ep.url !== fromUrl && inferPeerTransport(ep) !== "legacy_webhook"
      ),
    ];

    if (opts.apply) {
      peer.inbound_endpoints = nextEndpoints;
      if (transport === "wire_v1") {
        delete peer.inbound_webhook_url;
      }
      changed = true;
    }

    results.push({
      peer_id: peer.peer_id,
      status: "migrated",
      detail: opts.apply
        ? `wrote inbound_endpoints transport=${transport}`
        : `dry-run → transport=${transport} url=${fromUrl}`,
    });
  }

  if (opts.apply && changed) {
    savePeersRegistry(registry);
  }

  return { results, apply: Boolean(opts.apply) };
}

export function listLegacyTransportPeers(): PeerProfile[] {
  return loadPeersRegistry().peers.filter((peer) => {
    if (peer.inbound_webhook_url) return true;
    return (peer.inbound_endpoints ?? []).some(
      (ep) => inferPeerTransport(ep) === "legacy_webhook"
    );
  });
}
