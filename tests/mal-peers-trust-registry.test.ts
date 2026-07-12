import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getInstallRoot } from "../src/lib/orgos-paths.js";
import { peersRegistrySchema } from "../schemas/protocol/peers.js";
import { wireTrustRegistrySchema } from "../schemas/protocol/wire-trust-registry.js";

describe("mal peers trust-registry pin (W1-2)", () => {
  it("southwood PEER-001 protocol_public_key matches trust registry", () => {
    const peersPath = join(getInstallRoot(), "tenants/mal/data/protocol/peers.yaml");
    const registryPath = join(getInstallRoot(), "publish/protocol/wire-trust-registry.yaml");

    const peers = peersRegistrySchema.parse(parseYaml(readFileSync(peersPath, "utf-8")));
    const trust = wireTrustRegistrySchema.parse(parseYaml(readFileSync(registryPath, "utf-8")));

    const southwoodPeer = peers.peers.find((p) => p.peer_id === "PEER-001");
    const southwoodNode = trust.nodes.find((n) => n.node_id === "southwood");
    expect(southwoodPeer, "mal peers must include PEER-001 southwood").toBeTruthy();
    expect(southwoodNode, "trust registry must include southwood node").toBeTruthy();
    expect(southwoodPeer!.protocol_public_key).toBe(southwoodNode!.protocol_public_key);
    expect(southwoodPeer!.inbound_endpoints?.[0]?.transport).toBe("wire_v1");
    expect(southwoodPeer!.inbound_endpoints?.[0]?.url).toBe(
      `${southwoodNode!.wire_url}/wire/v1/events`
    );
  });

  it("mal node is pinned in trust registry with wire_url", () => {
    const registryPath = join(getInstallRoot(), "publish/protocol/wire-trust-registry.yaml");
    const trust = wireTrustRegistrySchema.parse(parseYaml(readFileSync(registryPath, "utf-8")));
    const mal = trust.nodes.find((n) => n.node_id === "mal");
    expect(mal?.protocol_public_key?.length).toBeGreaterThan(10);
    expect(mal?.wire_url).toMatch(/^https:\/\//);
  });

  it("PEER-002 aiac uses pk-prefixed DID and matches mal-peers-pilot seed", () => {
    const root = getInstallRoot();
    const peersPath = join(root, "tenants/mal/data/protocol/peers.yaml");
    const seedPath = join(root, "steward/platform/protocol/seed/mal-peers-pilot.yaml.example");
    const peers = peersRegistrySchema.parse(parseYaml(readFileSync(peersPath, "utf-8")));
    const seed = peersRegistrySchema.parse(parseYaml(readFileSync(seedPath, "utf-8")));
    const peer = peers.peers.find((p) => p.peer_id === "PEER-002");
    const seedPeer = seed.peers.find((p) => p.peer_id === "PEER-002");
    expect(peer, "mal peers must include PEER-002 aiac").toBeTruthy();
    expect(seedPeer, "mal-peers-pilot seed must include PEER-002").toBeTruthy();
    expect(peer!.did).toMatch(/^did:ooo:org:pk-[0-9a-f]{16}$/);
    expect(peer!.did).toBe(seedPeer!.did);
    expect(peer!.protocol_public_key).toBe(seedPeer!.protocol_public_key);
    expect(peer!.org_uri).toBe("steward://tenant/aiac");
  });
});
