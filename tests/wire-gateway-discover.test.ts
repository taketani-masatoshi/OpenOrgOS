import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  listWireGatewayDiscoverEntries,
  listUnregisteredWireGatewayPeers,
  listWireGatewayFederationCatalog,
  suggestWireGatewayPeerRegistration,
} from "../src/lib/wire-gateway/discover.js";

describe("wire-gateway discover (WG v2)", () => {
  beforeEach(() => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(join(protocolDir, "peers.yaml"), 'as_of: "2026-07-10"\npeers: []\n', "utf-8");
  });

  it("marks self tenant and lists trust-registry nodes", () => {
    const entries = listWireGatewayDiscoverEntries({ tenantId: "demo", jurisdiction: "JP" });
    expect(entries.some((e) => e.node_id === "org.example.co.jp" && e.self)).toBe(true);
    expect(entries.some((e) => e.node_id === "mal" && !e.self)).toBe(true);
  });

  it("lists unregistered wire peers for demo tenant", () => {
    const unregistered = listUnregisteredWireGatewayPeers({ tenantId: "demo", jurisdiction: "JP" });
    expect(unregistered.some((e) => e.node_id === "mal")).toBe(true);
    expect(unregistered.every((e) => !e.self)).toBe(true);
  });

  it("suggests peer register command with wire_v1 endpoint", () => {
    const mal = listUnregisteredWireGatewayPeers({ tenantId: "demo" }).find((e) => e.node_id === "mal");
    expect(mal).toBeDefined();
    const suggestion = suggestWireGatewayPeerRegistration(mal!);
    expect(suggestion.register_command).toContain("orgos protocol peer register");
    expect(suggestion.register_command).toContain(
      `${mal!.wire_url!.replace(/\/$/, "")}/wire/v1/events`
    );
  });

  it("lists federation catalog from trust registry", () => {
    const catalog = listWireGatewayFederationCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    expect(catalog.some((n) => n.node_id === "mal" && n.protocol_public_key_pinned)).toBe(true);
  });
});
