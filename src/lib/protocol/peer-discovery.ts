import { loadTenantConfig } from "../tenant.js";
import { findTrustedHubsForJurisdiction, loadTrustedHubsRegistry } from "./trusted-hubs.js";
import { loadPeersRegistry } from "./peers.js";

export interface DiscoverablePeerEntry {
  source: "local-registry" | "trusted-hub-catalog";
  peer_id?: string;
  display_name: string;
  jurisdiction: string;
  org_uri?: string;
  hub_id?: string;
  hub_url?: string;
  registered: boolean;
}

export function listDiscoverablePeers(opts?: { jurisdiction?: string }): DiscoverablePeerEntry[] {
  const jurisdiction = opts?.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const registeredIds = new Set(loadPeersRegistry().peers.map((p) => p.peer_id));
  const results: DiscoverablePeerEntry[] = [];

  for (const peer of loadPeersRegistry().peers) {
    if (opts?.jurisdiction && peer.jurisdiction !== opts.jurisdiction) continue;
    results.push({
      source: "local-registry",
      peer_id: peer.peer_id,
      display_name: peer.display_name,
      jurisdiction: peer.jurisdiction,
      org_uri: peer.org_uri,
      registered: registeredIds.has(peer.peer_id),
    });
  }

  const trusted = findTrustedHubsForJurisdiction(jurisdiction);
  for (const hub of trusted?.hubs ?? []) {
    results.push({
      source: "trusted-hub-catalog",
      display_name: hub.hub_id,
      jurisdiction,
      hub_id: hub.hub_id,
      hub_url: hub.hub_url,
      registered: false,
    });
  }

  return results;
}

export function listUnregisteredPeerCandidates(jurisdiction?: string): DiscoverablePeerEntry[] {
  const j = jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const registeredOrgUris = new Set(
    loadPeersRegistry()
      .peers.map((p) => p.org_uri)
      .filter(Boolean)
  );
  return listDiscoverablePeers({ jurisdiction: j }).filter(
    (entry) => entry.source === "trusted-hub-catalog" || (entry.org_uri && !registeredOrgUris.has(entry.org_uri))
  );
}

export function summarizeTrustedHubCatalog(): Array<{ jurisdiction: string; hub_count: number }> {
  const reg = loadTrustedHubsRegistry();
  return reg.jurisdictions.map((j) => ({
    jurisdiction: j.jurisdiction,
    hub_count: j.hubs.length,
  }));
}
