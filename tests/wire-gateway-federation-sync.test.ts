import { describe, it, expect } from "vitest";
import {
  syncWireGatewayFederation,
  listWireGatewayFederationCatalog,
} from "../src/lib/wire-gateway/discover.js";

describe("wire-gateway federation sync (W4-2)", () => {
  it("listWireGatewayFederationCatalog includes pinned mal and southwood", () => {
    const catalog = listWireGatewayFederationCatalog();
    expect(catalog.some((n) => n.node_id === "mal" && n.protocol_public_key_pinned)).toBe(true);
    expect(catalog.some((n) => n.node_id === "southwood" && n.protocol_public_key_pinned)).toBe(true);
  });

  it("syncWireGatewayFederation dry-run returns result array", async () => {
    const { results } = await syncWireGatewayFederation({ dryRun: true });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});
