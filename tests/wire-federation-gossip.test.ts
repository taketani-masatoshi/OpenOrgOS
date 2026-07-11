import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  exportWireFederationGossipCatalog,
  mergeWireFederationGossipCatalogs,
  federationGossipCatalogDigest,
} from "../src/lib/wire-gateway/federation-gossip.js";
import {
  applyIncomingWireFederationGossip,
  loadWireFederationGossipStore,
  getWireFederationGossipStorePath,
} from "../src/lib/wire-gateway/federation-gossip-store.js";

describe("wire federation gossip v2", () => {
  beforeEach(() => {
    setTenantId("demo");
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    const storePath = getWireFederationGossipStorePath();
    if (existsSync(storePath)) rmSync(storePath);
  });

  afterEach(() => {
    const storePath = getWireFederationGossipStorePath();
    if (existsSync(storePath)) rmSync(storePath);
  });

  it("exportWireFederationGossipCatalog includes registry nodes", () => {
    const catalog = exportWireFederationGossipCatalog("mal");
    expect(catalog.version).toBe("1");
    expect(catalog.nodes.length).toBeGreaterThan(0);
    expect(catalog.publisher_node_id).toBe("mal");
  });

  it("mergeWireFederationGossipCatalogs prefers pinned keys", () => {
    const local = exportWireFederationGossipCatalog();
    const remote = {
      ...local,
      publisher_node_id: "remote",
      nodes: [
        {
          node_id: "test-node",
          display_name: "Test",
          protocol_public_key_pinned: true,
          wire_url: "https://wire.test.example",
        },
      ],
    };
    const merged = mergeWireFederationGossipCatalogs(local, remote);
    expect(merged.nodes.some((n) => n.node_id === "test-node")).toBe(true);
    expect(federationGossipCatalogDigest(remote)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("applyIncomingWireFederationGossip persists merged catalog", () => {
    const local = exportWireFederationGossipCatalog();
    const remote = {
      ...local,
      publisher_node_id: "peer-gw",
      nodes: [
        {
          node_id: "gossip-peer",
          display_name: "Gossip Peer",
          protocol_public_key_pinned: true,
          wire_url: "https://wire.gossip.example",
        },
      ],
    };
    const store = applyIncomingWireFederationGossip(remote);
    expect(store.catalog.nodes.some((n) => n.node_id === "gossip-peer")).toBe(true);
    const loaded = loadWireFederationGossipStore();
    expect(loaded?.catalog.nodes.some((n) => n.node_id === "gossip-peer")).toBe(true);
  });
});
