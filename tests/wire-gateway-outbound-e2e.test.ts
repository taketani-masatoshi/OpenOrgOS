import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { startWireInternalApiServer } from "../src/lib/wire-gateway/internal-api-server.js";
import { startWireGatewayServer } from "../src/lib/wire-gateway/server.js";
import { WireInternalClient } from "../src/lib/wire-gateway/internal-client.js";
import { createOutboundPoller } from "../src/lib/wire-gateway/outbound-poller.js";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";
import { isWireDelivered } from "../src/lib/protocol/wire-delivered.js";
import { wireMessageSchema } from "../schemas/protocol/wire-message.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";

const INTERNAL_PORT = 18110;
const GATEWAY_PORT = 18450;
const BEARER = "e2e-poll-token";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("wire-gateway outbound poller E2E (task 3)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
`,
      "utf-8"
    );
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("poller delivers outbox via wire_v1 WireMessage and marks delivered", async () => {
    const received: unknown[] = [];
    const peerServer = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/wire/v1/events") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          received.push(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, accepted: true }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => peerServer.listen(0, "127.0.0.1", () => r()));
    const peerPort = (peerServer.address() as { port: number }).port;
    const peerWireUrl = `http://127.0.0.1:${peerPort}/wire/v1/events`;

    registerPeer({
      peer_id: "PEER-070",
      display_name: "Wire Peer",
      jurisdiction: "JP",
      org_uri: "steward://tenant/partner",
      protocol_public_key: exportProtocolPublicKeyBase64(),
      inbound_endpoints: [
        {
          url: peerWireUrl,
          mode: "push",
          priority: 1,
          transport: "wire_v1",
        },
      ],
    });

    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-E2E",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-070",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const config = wireGatewayConfigSchema.parse({
      node_id: "demo",
      listen: { host: "127.0.0.1", port: GATEWAY_PORT },
      internal_api: {
        base_url: `http://127.0.0.1:${INTERNAL_PORT}/internal/v1/wire`,
        bearer_token: BEARER,
      },
      outbound: { poll_interval_ms: 60_000 },
      audit: { path: join(getDataDir(), "protocol", "wire-gateway-audit.jsonl") },
    });

    const internal = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: INTERNAL_PORT,
      bearerToken: BEARER,
      tenantId: "demo",
    });
    const client = new WireInternalClient(config);
    const poller = createOutboundPoller(config, client);

    try {
      await poller.pollOnce();
      expect(received.length).toBe(1);
      const wire = wireMessageSchema.parse(received[0]);
      expect(wire.eventId).toBe(envelope.event_id);
      expect(wire.wireVersion).toBe("0.1");
      expect(isWireDelivered("PEER-070", envelope.event_id)).toBe(true);
    } finally {
      poller.stop();
      internal.close();
      peerServer.close();
    }
  });

  it("deliverProtocolEnvelope posts WireMessage for wire_v1 endpoint", async () => {
    const received: unknown[] = [];
    const peerServer = createServer((req, res) => {
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          received.push(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end("{}");
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => peerServer.listen(0, "127.0.0.1", () => r()));
    const peerPort = (peerServer.address() as { port: number }).port;

    registerPeer({
      peer_id: "PEER-071",
      display_name: "Direct Wire",
      jurisdiction: "JP",
      org_uri: "steward://tenant/partner",
      inbound_endpoints: [
        {
          url: `http://127.0.0.1:${peerPort}/wire/v1/events`,
          mode: "push",
          priority: 1,
          transport: "wire_v1",
        },
      ],
    });

    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-DIRECT",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-071",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const delivery = await deliverProtocolEnvelope(envelope, "PEER-071");
    expect(delivery.delivered).toBe(true);
    expect(received.length).toBe(1);
    expect(wireMessageSchema.parse(received[0]).eventId).toBe(envelope.event_id);
    peerServer.close();
  });

  it("gateway inbound health stays up beside poller client", async () => {
    const config = wireGatewayConfigSchema.parse({
      node_id: "demo",
      listen: { host: "127.0.0.1", port: GATEWAY_PORT + 1 },
      internal_api: {
        base_url: `http://127.0.0.1:${INTERNAL_PORT + 1}/internal/v1/wire`,
        bearer_token: BEARER,
      },
      outbound: { poll_interval_ms: 60_000 },
      audit: { path: join(getDataDir(), "protocol", "wire-gateway-audit.jsonl") },
    });
    const internal = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: INTERNAL_PORT + 1,
      bearerToken: BEARER,
      tenantId: "demo",
    });
    const gateway = await startWireGatewayServer({
      config,
      enableOutbound: false,
    });
    try {
      const health = await fetch(`http://127.0.0.1:${GATEWAY_PORT + 1}/wire/v1/health`);
      expect(health.ok).toBe(true);
    } finally {
      gateway.close();
      internal.close();
    }
  });
});
