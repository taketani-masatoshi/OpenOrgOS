import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";
import { appendProtocolAuditRecord, writeOutboxEnvelope } from "../src/lib/protocol/audit-chain.js";
import { getProtocolInboxDir, getProtocolOutboxDir } from "../src/lib/protocol/paths.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { runWithProtocolWriteGuard } from "../src/lib/protocol/protocol-write-guard.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
  signEventEnvelope,
} from "../src/lib/protocol/signing.js";
import { setTenantId, getTenantsDir } from "../src/lib/tenant.js";
import { createOutboundPoller } from "../src/lib/wire-gateway/outbound-poller.js";
import { WireInternalClient } from "../src/lib/wire-gateway/internal-client.js";
import { startWireInternalApiServer } from "../src/lib/wire-gateway/internal-api-server.js";
import { envelopeToWireMessage } from "../src/lib/wire-gateway/codec.js";
import {
  resolveWireGatewayDiscoverEntry,
  type WireGatewayDiscoverEntry,
} from "../src/lib/wire-gateway/discover.js";
import type { OpenOrgDnsResolver } from "../src/lib/wire-gateway/openorg-dns.js";
import { startWireGatewayServer } from "../src/lib/wire-gateway/server.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";

const TENANT_A = "wire-e2e-a";
const TENANT_B = "wire-e2e-b";
const TENANT_DNS = "wire-e2e-dns";
const TOKEN = "wire-e2e-token";

type Closable = { close: () => void };

function tenantDir(id: string): string {
  return join(getTenantsDir(), id);
}

function createTenant(id: string): void {
  const dir = tenantDir(id);
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(
    join(dir, "tenant.yaml"),
    `id: ${id}\nname: ${id}\njurisdiction: JP\nlifecycle: test\n`,
    "utf-8"
  );
  writeFileSync(join(dir, "data", "company.yaml"), `name: ${id}\n`, "utf-8");
}

function removeTenant(id: string): void {
  rmSync(tenantDir(id), { recursive: true, force: true });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

function makeSignedEnvelope(sender: string, receiver: string, privateKeyPem: string): EventEnvelope {
  const unsigned: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    origin: { org_id: sender, org_uri: `steward://tenant/${sender}` },
    destination: { org_id: receiver, org_uri: `steward://tenant/${receiver}` },
    identity: {
      org_ref: { org_id: sender, org_uri: `steward://tenant/${sender}` },
    },
    event: {
      type: "org.identity.presented",
      payload: { purpose: "gateway-e2e" },
    },
    signature: null,
  };
  return signEventEnvelope(unsigned, privateKeyPem);
}

function gatewayConfig(
  nodeId: string,
  gatewayPort: number,
  internalUrl: string,
  auditPath: string
) {
  return wireGatewayConfigSchema.parse({
    node_id: nodeId,
    node_uri: `steward://tenant/${nodeId}`,
    listen: { host: "127.0.0.1", port: gatewayPort },
    internal_api: { base_url: internalUrl, bearer_token: TOKEN },
    outbound: { poll_interval_ms: 60_000 },
    audit: { path: auditPath },
  });
}

describe("two Wire Gateways E2E", () => {
  const servers: Closable[] = [];

  beforeEach(() => {
    for (const id of [TENANT_A, TENANT_B]) {
      removeTenant(id);
      createTenant(id);
    }
  });

  afterEach(() => {
    for (const server of servers.splice(0).reverse()) server.close();
    setTenantId("demo");
    removeTenant(TENANT_A);
    removeTenant(TENANT_B);
  });

  it("delivers A→B, persists gossip, and rejects a nonce replay after B restarts", async () => {
    setTenantId(TENANT_A);
    const privateKeyA = ensureProtocolSigningKey();
    const publicKeyA = exportProtocolPublicKeyBase64()!;
    setTenantId(TENANT_B);
    ensureProtocolSigningKey();

    const internalA = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: 0,
      bearerToken: TOKEN,
      tenantId: TENANT_A,
    });
    const internalB = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: 0,
      bearerToken: TOKEN,
      tenantId: TENANT_B,
    });
    servers.push(internalA, internalB);

    const gatewayPortB = await freePort();
    setTenantId(TENANT_B);
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Gateway A",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${TENANT_A}`,
      protocol_public_key: publicKeyA,
    });
    const configB = gatewayConfig(
      TENANT_B,
      gatewayPortB,
      internalB.url,
      join(tenantDir(TENANT_B), "data", "protocol", "gateway-audit.jsonl")
    );
    let gatewayB = await startWireGatewayServer({ config: configB, enableOutbound: false });
    servers.push(gatewayB);

    const gatewayPortA = await freePort();
    setTenantId(TENANT_A);
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Gateway B",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${TENANT_B}`,
      inbound_endpoints: [
        {
          url: `${gatewayB.url}/wire/v1/events`,
          transport: "wire_v1",
          mode: "push",
          priority: 1,
        },
      ],
    });
    const configA = gatewayConfig(
      TENANT_A,
      gatewayPortA,
      internalA.url,
      join(tenantDir(TENANT_A), "data", "protocol", "gateway-audit.jsonl")
    );
    const gatewayA = await startWireGatewayServer({ config: configA, enableOutbound: false });
    servers.push(gatewayA);

    const envelope = makeSignedEnvelope(TENANT_A, TENANT_B, privateKeyA);
    runWithProtocolWriteGuard("wire-two-gateway-e2e", () => {
      appendProtocolAuditRecord({ envelope });
      writeOutboxEnvelope(envelope, getProtocolOutboxDir());
    });
    const poller = createOutboundPoller(configA, new WireInternalClient(configA));
    await poller.pollOnce();
    poller.stop();

    setTenantId(TENANT_B);
    const inboxPath = join(getProtocolInboxDir(), `${envelope.event_id}.json`);
    const deliveryDebug = [
      configA.audit.path,
      configB.audit.path,
    ].map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : `${path}: missing`));
    expect(existsSync(inboxPath), deliveryDebug.join("\n")).toBe(true);

    const catalogResponse = await fetch(`${gatewayA.url}/wire/v1/federation/catalog`);
    const catalog = (await catalogResponse.json()) as {
      version: "1";
      gossip_at: string;
      publisher_node_id: string;
      nodes: Array<Record<string, unknown>>;
    };
    catalog.nodes.push({
      node_id: "gossip-only.example",
      display_name: "Gossip-only node",
      wire_url: "https://wire.gossip-only.example",
      protocol_public_key_pinned: true,
    });
    const gossipResponse = await fetch(`${gatewayB.url}/wire/v1/federation/gossip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalog),
    });
    expect(gossipResponse.status).toBe(202);

    const replayWire = envelopeToWireMessage(envelope, { nonce: "persisted-replay-nonce" });
    const firstReplayResponse = await fetch(`${gatewayB.url}/wire/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(replayWire),
    });
    expect(firstReplayResponse.status).toBe(409);

    gatewayB.close();
    servers.splice(servers.indexOf(gatewayB), 1);
    setTenantId(TENANT_B);
    gatewayB = await startWireGatewayServer({ config: configB, enableOutbound: false });
    servers.push(gatewayB);

    const restoredCatalog = (await (
      await fetch(`${gatewayB.url}/wire/v1/federation/catalog`)
    ).json()) as { nodes: Array<{ node_id: string }> };
    expect(restoredCatalog.nodes.some((node) => node.node_id === "gossip-only.example")).toBe(true);

    const replayAfterRestart = await fetch(`${gatewayB.url}/wire/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(replayWire),
    });
    expect(replayAfterRestart.status).toBe(403);
    expect(await replayAfterRestart.json()).toMatchObject({ error: "replay" });
  });
});

describe("DNS-only discover and transport E2E", () => {
  beforeEach(() => {
    removeTenant(TENANT_DNS);
    createTenant(TENANT_DNS);
    setTenantId(TENANT_DNS);
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    setTenantId("demo");
    removeTenant(TENANT_DNS);
  });

  it("discovers an SRV-only gateway and delivers without a configured endpoint", async () => {
    let received = 0;
    const receiver = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/wire/v1/events") {
        received++;
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    const receiverPort = typeof address === "object" && address ? address.port : 0;

    const resolver: OpenOrgDnsResolver = {
      resolveSrv: async () => [
        { name: "127.0.0.1.", port: receiverPort, priority: 1 },
      ],
      resolveTxt: async () => [],
      fetch: async () => new Response(null, { status: 404 }),
    };
    const entry: WireGatewayDiscoverEntry = {
      source: "trust-registry",
      node_id: "dns-only.example",
      display_name: "DNS-only peer",
      node_uri: "steward://tenant/dns-only.example",
      registered: false,
      self: false,
    };

    try {
      const discovered = await resolveWireGatewayDiscoverEntry(entry, resolver);
      expect(discovered.profile?.inbound_endpoints?.[0]?.url).toBe(
        `http://127.0.0.1:${receiverPort}/wire/v1/events`
      );

      registerPeer({
        peer_id: "PEER-002",
        display_name: "DNS-only transport peer",
        jurisdiction: "JP",
        org_uri: "steward://tenant/dns-only.example",
      });
      const privateKey = ensureProtocolSigningKey();
      const envelope = makeSignedEnvelope(TENANT_DNS, "dns-only.example", privateKey);
      const result = await deliverProtocolEnvelope(envelope, "PEER-002", {
        dnsResolver: resolver,
      });

      expect(result).toMatchObject({
        delivered: true,
        endpoint: `http://127.0.0.1:${receiverPort}/wire/v1/events`,
        httpStatus: 202,
      });
      expect(received).toBe(1);
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });
});
