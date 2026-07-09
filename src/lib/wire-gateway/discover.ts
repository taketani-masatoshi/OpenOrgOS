import { getTenantId } from "../tenant.js";
import { loadPeersRegistry, registerPeer, nextPeerId } from "../protocol/peers.js";
import { loadWireTrustRegistry } from "../protocol/wire-trust-registry.js";
import type { WireTrustRegistryNode } from "../../../schemas/protocol/wire-trust-registry.js";
import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { syncWireTrustRegistryPublicKeys } from "../protocol/wire-trust-registry-sync.js";

export interface WireGatewayDiscoverEntry {
  source: "trust-registry";
  node_id: string;
  display_name: string;
  node_uri?: string;
  did?: string;
  wire_url?: string;
  witness_jurisdiction?: string;
  registered: boolean;
  self: boolean;
}

export interface WireGatewayFederationEntry {
  node_id: string;
  display_name: string;
  node_uri?: string;
  did?: string;
  wire_url?: string;
  witness_jurisdiction?: string;
  protocol_public_key_pinned: boolean;
}

export interface WireGatewayPeerSuggestion {
  entry: WireGatewayDiscoverEntry;
  register_command: string;
}

function tenantNodeUris(tenantId: string): Set<string> {
  return new Set([
    `steward://tenant/${tenantId}`,
    `steward://tenant/${tenantId}/`,
  ]);
}

function isRegisteredPeer(node: WireTrustRegistryNode, registeredOrgUris: Set<string>): boolean {
  if (node.node_uri && registeredOrgUris.has(node.node_uri)) return true;
  return loadPeersRegistry().peers.some(
    (p) =>
      p.org_uri === node.node_uri ||
      p.peer_id === node.node_id ||
      (node.did && p.org_uri === node.did)
  );
}

export function listWireGatewayDiscoverEntries(opts?: {
  tenantId?: string;
  jurisdiction?: string;
}): WireGatewayDiscoverEntry[] {
  const tenantId = opts?.tenantId ?? getTenantId();
  const registry = loadWireTrustRegistry();
  const selfUris = tenantNodeUris(tenantId);
  const registeredOrgUris = new Set(
    loadPeersRegistry()
      .peers.map((p) => p.org_uri)
      .filter(Boolean) as string[]
  );

  return registry.nodes
    .filter((node) => {
      if (opts?.jurisdiction && node.witness_jurisdiction !== opts.jurisdiction) return false;
      return true;
    })
    .map((node) => {
      const self =
        node.node_id === tenantId ||
        (node.node_uri ? selfUris.has(node.node_uri) : false) ||
        node.did === `did:ooo:org:${tenantId}`;
      return {
        source: "trust-registry" as const,
        node_id: node.node_id,
        display_name: node.display_name,
        node_uri: node.node_uri,
        did: node.did,
        wire_url: node.wire_url,
        witness_jurisdiction: node.witness_jurisdiction,
        registered: !self && isRegisteredPeer(node, registeredOrgUris),
        self,
      };
    });
}

export function listUnregisteredWireGatewayPeers(opts?: {
  tenantId?: string;
  jurisdiction?: string;
}): WireGatewayDiscoverEntry[] {
  return listWireGatewayDiscoverEntries(opts).filter((e) => !e.self && !e.registered);
}

export function suggestWireGatewayPeerRegistration(
  entry: WireGatewayDiscoverEntry
): WireGatewayPeerSuggestion {
  const wireEndpoint = entry.wire_url
    ? `${entry.wire_url.replace(/\/$/, "")}/wire/v1/events`
    : undefined;
  const parts = [
    "orgos protocol peer register",
    `--name "${entry.display_name}"`,
    `--jurisdiction ${entry.witness_jurisdiction ?? "JP"}`,
  ];
  if (entry.node_uri) parts.push(`--org-uri ${entry.node_uri}`);
  else if (entry.did) parts.push(`--org-uri ${entry.did}`);
  if (wireEndpoint) parts.push(`--webhook-url ${wireEndpoint}`);
  return { entry, register_command: parts.join(" ") };
}

export function listWireGatewayPeerSuggestions(opts?: {
  tenantId?: string;
  jurisdiction?: string;
}): WireGatewayPeerSuggestion[] {
  return listUnregisteredWireGatewayPeers(opts).map(suggestWireGatewayPeerRegistration);
}

/** Federation catalog view — all trust-registry Wire nodes (WG v2 read model). */
export function listWireGatewayFederationCatalog(): WireGatewayFederationEntry[] {
  const registry = loadWireTrustRegistry();
  return registry.nodes.map((node) => ({
    node_id: node.node_id,
    display_name: node.display_name,
    node_uri: node.node_uri,
    did: node.did,
    wire_url: node.wire_url,
    witness_jurisdiction: node.witness_jurisdiction,
    protocol_public_key_pinned: Boolean(node.protocol_public_key?.trim()),
  }));
}

function registryNodeForEntry(entry: WireGatewayDiscoverEntry): WireTrustRegistryNode | undefined {
  return loadWireTrustRegistry().nodes.find((n) => n.node_id === entry.node_id);
}

export function buildPeerProfileFromDiscoverEntry(entry: WireGatewayDiscoverEntry): PeerProfile {
  const node = registryNodeForEntry(entry);
  const wireUrl = entry.wire_url?.replace(/\/$/, "");
  const profile: PeerProfile = {
    peer_id: nextPeerId(),
    display_name: entry.display_name,
    jurisdiction: entry.witness_jurisdiction ?? "JP",
    org_uri: entry.node_uri,
    did: entry.did,
    protocol_public_key: node?.protocol_public_key,
  };
  if (wireUrl) {
    profile.inbound_endpoints = [
      {
        url: `${wireUrl}/wire/v1/events`,
        transport: "wire_v1",
        mode: "push",
        priority: 1,
      },
    ];
  }
  return profile;
}

export interface ApplyWireGatewayDiscoverOptions {
  tenantId?: string;
  jurisdiction?: string;
  dryRun?: boolean;
  nodeIds?: string[];
}

export interface ApplyWireGatewayDiscoverResult {
  dry_run: boolean;
  applied: PeerProfile[];
  skipped: Array<{ node_id: string; reason: string }>;
}

export function applyWireGatewayDiscover(
  opts: ApplyWireGatewayDiscoverOptions = {}
): ApplyWireGatewayDiscoverResult {
  const tenantId = opts.tenantId ?? getTenantId();
  let candidates = listUnregisteredWireGatewayPeers({ tenantId, jurisdiction: opts.jurisdiction });
  if (opts.nodeIds?.length) {
    const allow = new Set(opts.nodeIds);
    candidates = candidates.filter((c) => allow.has(c.node_id));
  }

  const applied: PeerProfile[] = [];
  const skipped: Array<{ node_id: string; reason: string }> = [];

  for (const entry of candidates) {
    if (!entry.wire_url) {
      skipped.push({ node_id: entry.node_id, reason: "no wire_url in trust registry" });
      continue;
    }
    const profile = buildPeerProfileFromDiscoverEntry(entry);
    if (opts.dryRun) {
      applied.push(profile);
    } else {
      registerPeer(profile);
      applied.push(profile);
    }
  }

  return { dry_run: opts.dryRun === true, applied, skipped };
}

/** Federation sync — pull protocol_public_key from remote well-known into trust registry. */
export async function syncWireGatewayFederation(opts?: {
  nodeId?: string;
  dryRun?: boolean;
  force?: boolean;
}) {
  return syncWireTrustRegistryPublicKeys({
    nodeId: opts?.nodeId,
    dryRun: opts?.dryRun,
    force: opts?.force,
  });
}
