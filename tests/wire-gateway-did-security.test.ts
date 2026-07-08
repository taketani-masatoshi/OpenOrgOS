import { describe, it, expect } from "vitest";
import { findPeerForSender } from "../src/lib/wire-gateway/security.js";
import type { InternalWirePeerEntry } from "../schemas/protocol/wire-gateway-internal.js";

describe("wire-gateway DID peer matching", () => {
  const peers: InternalWirePeerEntry[] = [
    {
      peer_node_id: "mal",
      peer_node_uri: "steward://tenant/mal",
      peer_did: "did:ooo:org:mal",
      protocol_public_key: "MCowBQYDK2VwAyEAZo2I49g0pttiiJJ2U5qVcRWf3FKqU7HsTsIHft720mM=",
      transport: "wire_v1",
    },
  ];

  it("finds peer when sender is DID", () => {
    expect(findPeerForSender(peers, "did:ooo:org:mal")).toBeDefined();
  });

  it("finds peer when sender is steward tenant slug via trust registry", () => {
    expect(findPeerForSender(peers, "mal")).toBeDefined();
  });
});
