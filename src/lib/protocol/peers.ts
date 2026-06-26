import { existsSync } from "node:fs";
import { peersRegistrySchema, type PeerProfile, type PeersRegistry } from "../../../schemas/protocol/peers.js";
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
