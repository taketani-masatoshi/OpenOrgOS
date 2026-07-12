import { describe, it, expect } from "vitest";
import {
  loadWireTrustRegistry,
  resolveWireTrustNode,
  validateWireTrustRegistry,
  nodeIdentifierMatches,
} from "../src/lib/protocol/wire-trust-registry.js";

describe("wire-trust-registry", () => {
  it("loads platform registry", () => {
    const reg = loadWireTrustRegistry();
    expect(reg.nodes.length).toBeGreaterThan(0);
    expect(reg.publish_url).toContain("wire-trust-registry");
  });

  it("validates pinned public keys without missing-key warnings", () => {
    const result = validateWireTrustRegistry();
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "missing-public-key")).toBe(false);
    expect(result.issues.some((i) => i.code === "missing-public-key")).toBe(false);
  });

  it("resolves by node_id, did, and steward URI", () => {
    expect(resolveWireTrustNode("did:ooo:org:pk-2da32dcd88900ba3")?.matched_by).toBe("did");
    expect(resolveWireTrustNode("steward://tenant/mal")?.matched_by).toBe("node_uri");
    expect(resolveWireTrustNode("mal")?.matched_by).toBe("node_id");
  });

  it("matches node identifiers against peer entry", () => {
    const ok = nodeIdentifierMatches("did:ooo:org:pk-5391e3fd05736bb5", {
      peer_node_id: "mal",
      peer_node_uri: "steward://tenant/mal",
      peer_did: "did:ooo:org:pk-5391e3fd05736bb5",
    });
    expect(ok).toBe(true);
  });
});
