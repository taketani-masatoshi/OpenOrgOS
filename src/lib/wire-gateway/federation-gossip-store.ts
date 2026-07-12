import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getProtocolDataDir } from "../protocol/paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import type { WireGatewayFederationEntry } from "./discover.js";
import {
  exportWireFederationGossipCatalog,
  mergeWireFederationGossipCatalogs,
  type WireFederationGossipCatalog,
} from "./federation-gossip.js";

const gossipStoreSchema = z.object({
  version: z.literal(1),
  updated_at: z.string(),
  catalog: z.object({
    version: z.literal("1"),
    gossip_at: z.string(),
    publisher_node_id: z.string(),
    nodes: z.array(
      z.object({
        node_id: z.string(),
        display_name: z.string(),
        node_uri: z.string().optional(),
        did: z.string().optional(),
        wire_url: z.string().optional(),
        witness_jurisdiction: z.string().optional(),
        protocol_public_key_pinned: z.boolean(),
      })
    ),
  }),
});

export type WireFederationGossipStore = z.output<typeof gossipStoreSchema>;

export function getWireFederationGossipStorePath(): string {
  return join(getProtocolDataDir(), "federation-gossip-store.yaml");
}

export function loadWireFederationGossipStore(): WireFederationGossipStore | null {
  const path = getWireFederationGossipStorePath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, gossipStoreSchema);
}

export function saveWireFederationGossipStore(
  catalog: WireFederationGossipCatalog
): WireFederationGossipStore {
  const store: WireFederationGossipStore = {
    version: 1,
    updated_at: new Date().toISOString(),
    catalog,
  };
  writeYamlFile(getWireFederationGossipStorePath(), store);
  return store;
}

/** Merge incoming gossip catalog with local state and persist. */
export function applyIncomingWireFederationGossip(
  remote: WireFederationGossipCatalog
): WireFederationGossipStore {
  const local = exportWireFederationGossipCatalog();
  const merged = mergeWireFederationGossipCatalogs(local, remote);
  return saveWireFederationGossipStore(merged);
}

/** Federation catalog for GET — merges persisted gossip with trust registry. */
export function listWireFederationCatalogWithGossip(): WireGatewayFederationEntry[] {
  const store = loadWireFederationGossipStore();
  const base = exportWireFederationGossipCatalog();
  if (!store) return base.nodes;
  const byId = new Map<string, WireGatewayFederationEntry>();
  for (const node of base.nodes) byId.set(node.node_id, node);
  for (const node of store.catalog.nodes) {
    const existing = byId.get(node.node_id);
    if (!existing || (!existing.protocol_public_key_pinned && node.protocol_public_key_pinned)) {
      byId.set(node.node_id, node);
    }
  }
  return [...byId.values()];
}
