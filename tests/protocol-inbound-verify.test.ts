import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { findPeerByOrgRef } from "../src/lib/protocol/inbound-verify.js";

describe("findPeerByOrgRef", () => {
  beforeEach(() => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    mkdirSync(protocolDir, { recursive: true });
    writeFileSync(
      join(protocolDir, "peers.yaml"),
      `as_of: "2026-07-12"
peers:
  - peer_id: PEER-101
    display_name: DID Peer
    jurisdiction: JP
    org_uri: steward://tenant/did-peer
    did: did:ooo:org:pk-abcdef0123456789
    protocol_public_key: MCowBQYDK2VwAyEA111111111111111111111111111111111111111111111=
  - peer_id: PEER-102
    display_name: URI Peer
    jurisdiction: JP
    org_uri: steward://tenant/uri-peer
`
    );
  });

  it("matches peer.did against org_id when org_uri is the DID", () => {
    const peer = findPeerByOrgRef({
      org_id: "did:ooo:org:pk-abcdef0123456789",
      org_uri: "did:ooo:org:pk-abcdef0123456789",
    });
    expect(peer?.peer_id).toBe("PEER-101");
  });

  it("matches peer.did against org_uri even when org_id is a slug", () => {
    const peer = findPeerByOrgRef({
      org_id: "did-peer",
      org_uri: "did:ooo:org:pk-abcdef0123456789",
    });
    expect(peer?.peer_id).toBe("PEER-101");
  });

  it("falls back to steward org_uri exact match", () => {
    const peer = findPeerByOrgRef({
      org_id: "uri-peer",
      org_uri: "steward://tenant/uri-peer",
    });
    expect(peer?.peer_id).toBe("PEER-102");
  });

  it("matches PEER-* org_id to peer_id", () => {
    const peer = findPeerByOrgRef({
      org_id: "PEER-101",
      org_uri: "steward://tenant/other",
    });
    expect(peer?.peer_id).toBe("PEER-101");
  });
});
