import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  applyWireGatewayDiscover,
  buildPeerProfileFromDiscoverEntry,
} from "../src/lib/wire-gateway/discover.js";
import { loadPeersRegistry } from "../src/lib/protocol/peers.js";

describe("wire-gateway discover apply (W4-1)", () => {
  beforeEach(() => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(join(protocolDir, "peers.yaml"), 'as_of: "2026-07-10"\npeers: []\n', "utf-8");
  });

  it("dry-run builds wire_v1 peer profiles without writing", () => {
    const result = applyWireGatewayDiscover({ tenantId: "demo", dryRun: true });
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.applied[0]!.inbound_endpoints?.[0]?.transport).toBe("wire_v1");
    expect(loadPeersRegistry().peers).toHaveLength(0);
  });

  it("apply registers unregistered trust-registry nodes", () => {
    const result = applyWireGatewayDiscover({ tenantId: "demo", dryRun: false });
    expect(result.applied.length).toBeGreaterThan(0);
    const peers = loadPeersRegistry().peers;
    expect(peers.length).toBe(result.applied.length);
    expect(peers.some((p) => p.inbound_endpoints?.[0]?.url.includes("/wire/v1/events"))).toBe(true);
  });

  it("buildPeerProfileFromDiscoverEntry uses wire/v1/events endpoint", () => {
    const profile = buildPeerProfileFromDiscoverEntry({
      source: "trust-registry",
      node_id: "mal",
      display_name: "MAL Co",
      node_uri: "steward://tenant/mal",
      wire_url: "https://wire.mal.example",
      witness_jurisdiction: "JP",
      registered: false,
      self: false,
    });
    expect(profile.inbound_endpoints?.[0]?.url).toBe("https://wire.mal.example/wire/v1/events");
  });
});
