import { describe, it, expect } from "vitest";
import {
  isDnsStyleNodeId,
  resolveOpenOrgWireUrl,
  formatOpenOrgWireDnsTxt,
  type OpenOrgDnsResolver,
} from "../src/lib/wire-gateway/openorg-dns.js";

describe("OpenOrg DNS", () => {
  it("isDnsStyleNodeId accepts FQDN and rejects DID/URI", () => {
    expect(isDnsStyleNodeId("org.example.co.jp")).toBe(true);
    expect(isDnsStyleNodeId("did:ooo:org:pk-abc")).toBe(false);
    expect(isDnsStyleNodeId("steward://tenant/mal")).toBe(false);
    expect(isDnsStyleNodeId("mal")).toBe(false);
  });

  it("resolveOpenOrgWireUrl uses trust-registry first", async () => {
    const result = await resolveOpenOrgWireUrl("mal");
    expect(result.source).toBe("trust-registry");
    expect(result.wire_url).toContain("wire");
  });

  it("resolveOpenOrgWireUrl uses mock SRV", async () => {
    const mock: OpenOrgDnsResolver = {
      resolveSrv: async () => [{ name: "wire.example.co.jp.", port: 443, priority: 1 }],
      resolveTxt: async () => [],
      fetch: async () => new Response(null, { status: 404 }),
    };
    const result = await resolveOpenOrgWireUrl("unknown.example.co.jp", { resolver: mock });
    expect(result.source).toBe("dns-srv");
    expect(result.wire_url).toBe("https://wire.example.co.jp");
  });

  it("formatOpenOrgWireDnsTxt", () => {
    expect(formatOpenOrgWireDnsTxt("https://wire.example.co.jp/")).toBe(
      "wire-url=https://wire.example.co.jp"
    );
  });

  it("applyWireGatewayDiscoverAsync resolves DNS-style node_id", async () => {
    const { applyWireGatewayDiscoverAsync } = await import("../src/lib/wire-gateway/discover.js");
    const mock = {
      resolveSrv: async () => [{ name: "wire.discover.example.", port: 443, priority: 1 }],
      resolveTxt: async () => [],
      fetch: async () => new Response(null, { status: 404 }),
    };
    const { resolveOpenOrgWireUrl } = await import("../src/lib/wire-gateway/openorg-dns.js");
    const resolved = await resolveOpenOrgWireUrl("discover.example", { resolver: mock });
    expect(resolved.source).toBe("dns-srv");
    expect(resolved.wire_url).toBe("https://wire.discover.example");
  });
});
