import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  generateProtocolKeyPair,
  signEventEnvelope,
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { envelopeToWireMessage } from "../src/lib/wire-gateway/codec.js";
import { startWireInternalApiServer } from "../src/lib/wire-gateway/internal-api-server.js";
import { startWireGatewayServer } from "../src/lib/wire-gateway/server.js";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";
import { getProtocolInboxDir } from "../src/lib/protocol/paths.js";
import { allocateEphemeralPort } from "./helpers/ephemeral-port.js";

const BEARER = "wire-test-token";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

describe("wire-gateway server (WG-1)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("health, well-known, and inbound wire POST → inbox", async () => {
    const internalPort = await allocateEphemeralPort();
    const gatewayPort = await allocateEphemeralPort();
    const senderKeys = generateProtocolKeyPair();
    registerPeer({
      peer_id: "PEER-099",
      display_name: "Sender Org",
      jurisdiction: "JP",
      org_uri: "steward://tenant/sender",
      protocol_public_key: senderKeys.publicKey,
    });

    const doc = buildIdentityDocument();
    doc.org_ref = { org_id: "sender", org_uri: "steward://tenant/sender" };
    const unsigned = buildIdentityEnvelope(doc, {
      org_id: "demo",
      org_uri: "steward://tenant/demo",
    });
    const signed = signEventEnvelope(unsigned, senderKeys.privateKeyPem);
    const wire = envelopeToWireMessage(signed, { nonce: "testnonce12345678" });

    const config = wireGatewayConfigSchema.parse({
      node_id: "demo",
      node_uri: "steward://tenant/demo",
      display_name: "Demo Corp",
      listen: { host: "127.0.0.1", port: gatewayPort },
      internal_api: {
        base_url: `http://127.0.0.1:${internalPort}/internal/v1/wire`,
        bearer_token: BEARER,
      },
      outbound: { poll_interval_ms: 60_000 },
      audit: { path: join(getDataDir(), "protocol", "wire-gateway-audit.jsonl") },
    });

    const internal = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: internalPort,
      bearerToken: BEARER,
      tenantId: "demo",
    });

    const gateway = await startWireGatewayServer({
      config,
      publicBaseUrl: `http://127.0.0.1:${gatewayPort}`,
      enableOutbound: false,
    });

    try {
      const health = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/health`);
      expect(health.ok).toBe(true);
      const healthBody = (await health.json()) as { service: string; node_id: string };
      expect(healthBody.service).toBe("wire-gateway");
      expect(healthBody.node_id).toBe("demo");

      const wellKnown = await fetch(`http://127.0.0.1:${gatewayPort}/.well-known/wire-node.json`);
      expect(wellKnown.ok).toBe(true);
      const wkBody = (await wellKnown.json()) as { protocol_public_key: string; endpoints: { events_push: string } };
      expect(wkBody.protocol_public_key).toBe(exportProtocolPublicKeyBase64());
      expect(wkBody.endpoints.events_push).toContain("/wire/v1/events");

      const catalog = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/federation/catalog`);
      expect(catalog.ok).toBe(true);
      const catBody = (await catalog.json()) as { version: string; nodes: unknown[] };
      expect(catBody.version).toBe("1");
      expect(catBody.nodes.length).toBeGreaterThan(0);

      const res = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wire),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { ok: boolean; eventId: string; accepted: boolean };
      expect(body.ok).toBe(true);
      expect(body.eventId).toBe(signed.event_id);
      expect(body.accepted).toBe(true);

      const inboxPath = join(getProtocolInboxDir(), `${signed.event_id}.json`);
      expect(existsSync(inboxPath)).toBe(true);

      const replay = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wire),
      });
      expect(replay.status).toBe(403);
      const replayBody = (await replay.json()) as { error: string };
      expect(replayBody.error).toBe("replay");

      const remoteCatalog = {
        version: "1" as const,
        gossip_at: new Date().toISOString(),
        publisher_node_id: "steward://tenant/sender",
        nodes: [
          {
            node_id: "remote-node",
            display_name: "Remote Node",
            protocol_public_key_pinned: true,
            wire_url: "https://wire.remote.example",
          },
        ],
      };
      const gossipPost = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/federation/gossip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remoteCatalog),
      });
      expect(gossipPost.status).toBe(202);
      const gossipBody = (await gossipPost.json()) as { ok: boolean; merged_nodes: number };
      expect(gossipBody.ok).toBe(true);
      expect(gossipBody.merged_nodes).toBeGreaterThan(0);

      const catalogAfter = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/federation/catalog`);
      const catAfterBody = (await catalogAfter.json()) as { nodes: Array<{ node_id: string }> };
      expect(catAfterBody.nodes.some((n) => n.node_id === "remote-node")).toBe(true);
    } finally {
      gateway.close();
      internal.close();
    }
  });

  it("rejects unknown sender peer", async () => {
    const internalPort = await allocateEphemeralPort();
    const gatewayPort = await allocateEphemeralPort();
    const unknownKeys = generateProtocolKeyPair();
    const doc = buildIdentityDocument();
    doc.org_ref = { org_id: "unknown", org_uri: "steward://tenant/unknown" };
    const signed = signEventEnvelope(
      buildIdentityEnvelope(doc, { org_id: "demo", org_uri: "steward://tenant/demo" }),
      unknownKeys.privateKeyPem
    );
    const wire = envelopeToWireMessage(signed, { nonce: "unknownnonce123456" });

    const config = wireGatewayConfigSchema.parse({
      node_id: "demo",
      listen: { host: "127.0.0.1", port: gatewayPort },
      internal_api: {
        base_url: `http://127.0.0.1:${internalPort}/internal/v1/wire`,
        bearer_token: BEARER,
      },
      outbound: { poll_interval_ms: 60_000 },
      audit: { path: join(getDataDir(), "protocol", "wire-gateway-audit.jsonl") },
    });

    const internal = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: internalPort,
      bearerToken: BEARER,
      tenantId: "demo",
    });
    const gateway = await startWireGatewayServer({
      config,
      enableOutbound: false,
    });

    try {
      const res = await fetch(`http://127.0.0.1:${gatewayPort}/wire/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wire),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("peer_unknown");
    } finally {
      gateway.close();
      internal.close();
    }
  });
});
