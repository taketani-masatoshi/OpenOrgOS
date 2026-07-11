import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getInstallRoot } from "../src/lib/orgos-paths.js";
import { findPeer, registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { peersRegistrySchema } from "../schemas/protocol/peers.js";
import { wireMessageSchema } from "../schemas/protocol/wire-message.js";

describe("mal wire peer deliver (Top5 W-5)", () => {
  let peerServer: Server | undefined;
  let peersBackup: string | undefined;

  beforeEach(() => {
    setTenantId("mal");
    ensureProtocolSigningKey();
    const wireDeliveredPath = join(getDataDir(), "protocol", "wire-delivered.yaml");
    if (existsSync(wireDeliveredPath)) {
      unlinkSync(wireDeliveredPath);
    }
    const peersPath = join(getDataDir(), "protocol", "peers.yaml");
    const seedPath = join(
      getInstallRoot(),
      "steward/platform/protocol/seed/mal-peers-pilot.yaml.example"
    );
    if (!existsSync(peersPath) || !readFileSync(peersPath, "utf-8").includes("wire_v1")) {
      writeFileSync(peersPath, readFileSync(seedPath, "utf-8"), "utf-8");
    }
    peersBackup = readFileSync(peersPath, "utf-8");
  });

  afterEach(async () => {
    if (peersBackup) {
      writeFileSync(join(getDataDir(), "protocol", "peers.yaml"), peersBackup, "utf-8");
    }
    await new Promise<void>((resolve) => {
      if (!peerServer) return resolve();
      peerServer.close(() => resolve());
    });
    peerServer = undefined;
  });

  it("delivers one wire_v1 envelope to southwood peer (PEER-001)", async () => {
    const received: unknown[] = [];
    peerServer = createServer((req, res) => {
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
    await new Promise<void>((r) => peerServer!.listen(0, "127.0.0.1", () => r()));
    const peerPort = (peerServer.address() as { port: number }).port;
    const localUrl = `http://127.0.0.1:${peerPort}/wire/v1/events`;

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Southwood Inc",
      jurisdiction: "JP",
      org_uri: "steward://tenant/southwood",
      did: "did:ooo:org:pk-f5c38734d6a8a462",
      protocol_public_key: "MCowBQYDK2VwAyEA5/aLrlreTf6lNGa+V+m9ToGEfBF71iaW3Lo5R4PGsmU=",
      inbound_endpoints: [
        {
          url: localUrl,
          transport: "wire_v1",
          mode: "push",
          priority: 1,
        },
      ],
    });
    expect(findPeer("PEER-001")?.inbound_endpoints?.[0]?.url).toBe(localUrl);

    const attestation = operatorAttestationSchema.parse({
      operator_id: "op-mal",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-MAL-SOUTHWOOD-001",
      approval_policy_ref: "REG-004",
    });

    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-012",
      operatorAttestation: attestation,
    });

    const delivery = await deliverProtocolEnvelope(envelope, "PEER-001");
    expect(delivery.delivered, delivery.reason).toBe(true);
    expect(received).toHaveLength(1);
    const wireMsg = wireMessageSchema.parse(received[0]);
    expect(wireMsg.eventId).toBe(envelope.event_id);
    expect(wireMsg.sender).toMatch(/mal/);
  });

  it("mal peers seed is committed under tenants/mal", () => {
    const seedPath = join(getInstallRoot(), "tenants/mal/data/protocol/peers.yaml");
    const registry = peersRegistrySchema.parse(parseYaml(readFileSync(seedPath, "utf-8")));
    const southwood = registry.peers.find((p) => p.peer_id === "PEER-001");
    expect(southwood?.inbound_endpoints?.[0]?.transport).toBe("wire_v1");
  });
});
