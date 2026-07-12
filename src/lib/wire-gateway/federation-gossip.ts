import { createHash } from "node:crypto";
import { listWireGatewayFederationCatalog, type WireGatewayFederationEntry } from "./discover.js";
import { loadWireTrustRegistry } from "../protocol/wire-trust-registry.js";
import { applyIncomingWireFederationGossip } from "./federation-gossip-store.js";

export {
  applyIncomingWireFederationGossip,
  listWireFederationCatalogWithGossip,
} from "./federation-gossip-store.js";

export const WIRE_FEDERATION_GOSSIP_VERSION = "1" as const;

export interface WireFederationGossipCatalog {
  version: typeof WIRE_FEDERATION_GOSSIP_VERSION;
  gossip_at: string;
  publisher_node_id: string;
  nodes: WireGatewayFederationEntry[];
}

export function exportWireFederationGossipCatalog(
  publisherNodeId?: string
): WireFederationGossipCatalog {
  const registry = loadWireTrustRegistry();
  const publisher =
    publisherNodeId ??
    registry.nodes.find((n) => n.wire_url)?.node_id ??
    registry.nodes[0]?.node_id ??
    "platform";
  return {
    version: WIRE_FEDERATION_GOSSIP_VERSION,
    gossip_at: new Date().toISOString(),
    publisher_node_id: publisher,
    nodes: listWireGatewayFederationCatalog(),
  };
}

export function mergeWireFederationGossipCatalogs(
  local: WireFederationGossipCatalog,
  remote: WireFederationGossipCatalog
): WireFederationGossipCatalog {
  const byId = new Map<string, WireGatewayFederationEntry>();
  for (const node of local.nodes) byId.set(node.node_id, node);
  for (const node of remote.nodes) {
    const existing = byId.get(node.node_id);
    if (!existing || (!existing.protocol_public_key_pinned && node.protocol_public_key_pinned)) {
      byId.set(node.node_id, node);
    }
  }
  return {
    version: WIRE_FEDERATION_GOSSIP_VERSION,
    gossip_at: new Date().toISOString(),
    publisher_node_id: remote.publisher_node_id,
    nodes: [...byId.values()],
  };
}

export function federationGossipCatalogDigest(catalog: WireFederationGossipCatalog): string {
  const payload = {
    version: catalog.version,
    publisher_node_id: catalog.publisher_node_id,
    nodes: catalog.nodes.map((n) => ({
      node_id: n.node_id,
      did: n.did,
      wire_url: n.wire_url,
      protocol_public_key_pinned: n.protocol_public_key_pinned,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function fetchRemoteWireFederationGossip(
  wireBaseUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<WireFederationGossipCatalog | null> {
  const base = wireBaseUrl.replace(/\/$/, "");
  try {
    const res = await fetchFn(`${base}/wire/v1/federation/catalog`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as WireFederationGossipCatalog;
    if (body.version !== WIRE_FEDERATION_GOSSIP_VERSION || !Array.isArray(body.nodes)) return null;
    return body;
  } catch {
    return null;
  }
}

export interface WireFederationGossipSyncResult {
  peer_wire_url: string;
  status: "synced" | "skipped" | "unreachable";
  remote_nodes?: number;
  digest?: string;
}

/** Pull federation catalog from each pinned registry node with wire_url (WG v2 gossip). */
export async function syncWireFederationGossipFromRegistry(opts?: {
  dryRun?: boolean;
  fetchFn?: typeof fetch;
}): Promise<{ local: WireFederationGossipCatalog; results: WireFederationGossipSyncResult[] }> {
  const local = exportWireFederationGossipCatalog();
  const results: WireFederationGossipSyncResult[] = [];
  let merged = local;

  for (const node of loadWireTrustRegistry().nodes) {
    if (!node.wire_url?.trim()) continue;
    const remote = await fetchRemoteWireFederationGossip(node.wire_url, opts?.fetchFn);
    if (!remote) {
      results.push({ peer_wire_url: node.wire_url, status: "unreachable" });
      continue;
    }
    merged = mergeWireFederationGossipCatalogs(merged, remote);
    results.push({
      peer_wire_url: node.wire_url,
      status: "synced",
      remote_nodes: remote.nodes.length,
      digest: federationGossipCatalogDigest(remote),
    });
  }

  if (!opts?.dryRun && results.some((r) => r.status === "synced")) {
    saveWireFederationGossipStore(merged);
  }

  return { local: merged, results };
}

function saveWireFederationGossipStore(catalog: WireFederationGossipCatalog): void {
  applyIncomingWireFederationGossip(catalog);
}

export function validateWireFederationGossipPost(
  body: unknown
): WireFederationGossipCatalog | null {
  if (!body || typeof body !== "object") return null;
  const b = body as WireFederationGossipCatalog;
  if (b.version !== WIRE_FEDERATION_GOSSIP_VERSION || !Array.isArray(b.nodes)) return null;
  return b;
}
