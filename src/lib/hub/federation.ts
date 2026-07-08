import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  hubFederationSchema,
  type HubFederationConfig,
} from "../../../schemas/protocol/hub-federation.js";
import type { WitnessHubEntry } from "../../../schemas/protocol/witness-pool.js";
import { getHubFederationPath, getGossipCursorPath, getGossipCursorDir } from "./paths.js";
import { getHubId } from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export interface GossipCursor {
  peer_id: string;
  last_recorded_at: string;
  last_attestation_id?: string;
  updated_at: string;
}

export function loadHubFederation(): HubFederationConfig {
  const path = getHubFederationPath();
  if (!existsSync(path)) {
    return hubFederationSchema.parse({ hub_id: getHubId(), hub_peers: [], gossip: { enabled: true, interval_sec: 300 } });
  }
  return readYamlFile(path, hubFederationSchema);
}

export function saveHubFederation(config: HubFederationConfig): void {
  writeYamlFile(getHubFederationPath(), config);
}

export function findFederationPeer(peerId: string, config?: HubFederationConfig): WitnessHubEntry | undefined {
  const federation = config ?? loadHubFederation();
  return federation.hub_peers.find((p) => p.hub_id === peerId);
}

export function addFederationPeer(peer: WitnessHubEntry): HubFederationConfig {
  const federation = loadHubFederation();
  const idx = federation.hub_peers.findIndex((p) => p.hub_id === peer.hub_id);
  if (idx >= 0) {
    federation.hub_peers[idx] = peer;
  } else {
    federation.hub_peers.push(peer);
  }
  saveHubFederation(federation);
  return federation;
}

export function loadGossipCursor(peerId: string): GossipCursor | undefined {
  const path = getGossipCursorPath(peerId);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as GossipCursor;
}

export function saveGossipCursor(cursor: GossipCursor): void {
  mkdirSync(getGossipCursorDir(), { recursive: true });
  writeFileSync(getGossipCursorPath(cursor.peer_id), JSON.stringify(cursor, null, 2), "utf-8");
}

export function updateGossipCursor(peerId: string, lastRecordedAt: string, lastAttestationId?: string): GossipCursor {
  const cursor: GossipCursor = {
    peer_id: peerId,
    last_recorded_at: lastRecordedAt,
    last_attestation_id: lastAttestationId,
    updated_at: new Date().toISOString(),
  };
  saveGossipCursor(cursor);
  return cursor;
}
