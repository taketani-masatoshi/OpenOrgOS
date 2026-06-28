#!/usr/bin/env node
/**
 * 2-hop mesh deliver demo — mal → PEER-002 relay → PEER-003 push → local inbox mirror
 */

import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { deliverEnvelopeViaMesh } from "../src/lib/protocol/peer-mesh.js";
import { getMeshRoutesYamlPath, getProtocolInboxDir } from "../src/lib/protocol/paths.js";
import { mirrorInboundEnvelope } from "../src/lib/protocol/transport.js";
import { parseEventEnvelope } from "../src/lib/protocol/envelope.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";

async function main(): Promise<void> {
  if (!existsSync(join(ROOT_DIR, "tenants", "mal", "tenant.yaml"))) {
    console.error("Tenant mal not found");
    process.exit(1);
  }

  const eventId = randomUUID();
  console.log(`Mesh deliver demo — mal → PEER-002 → PEER-003 · event_id ${eventId}\n`);

  setTenantId("mal");
  ensureProtocolSigningKey();

  const postOrder: string[] = [];
  const hop1 = createServer((_req, res) => {
    postOrder.push("PEER-002");
    res.writeHead(202);
    res.end("{}");
  });
  const hop2 = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      postOrder.push("PEER-003");
      const body = Buffer.concat(chunks).toString("utf-8");
      mirrorInboundEnvelope(parseEventEnvelope(JSON.parse(body)));
      res.writeHead(202);
      res.end("{}");
    });
  });

  await new Promise<void>((r) => hop1.listen(9477, "127.0.0.1", () => r()));
  await new Promise<void>((r) => hop2.listen(9478, "127.0.0.1", () => r()));

  try {
    registerPeer({
      peer_id: "PEER-002",
      display_name: "Mesh hop relay",
      jurisdiction: "JP",
      inbound_endpoints: [{ url: "http://127.0.0.1:9477/relay", priority: 1, mode: "relay" }],
    });
    registerPeer({
      peer_id: "PEER-003",
      display_name: "Mesh final peer",
      jurisdiction: "HK",
      inbound_endpoints: [{ url: "http://127.0.0.1:9478/webhook", priority: 1, mode: "push" }],
    });

    mkdirSync(join(ROOT_DIR, "tenants", "mal", "data", "protocol"), { recursive: true });
    writeFileSync(
      getMeshRoutesYamlPath(),
      `routes:
  - destination_peer_id: PEER-003
    via:
      - PEER-002
      - PEER-003
    notes: demo 2-hop mesh
`,
      "utf-8"
    );

    const envelope = maybeSignEnvelope(
      eventEnvelopeSchema.parse({
        protocol_version: "1",
        event_id: eventId,
        occurred_at: new Date().toISOString(),
        origin: { org_id: "PEER-001", org_uri: "steward://tenant/mal" },
        destination: { org_id: "PEER-003", org_uri: "steward://tenant/aiac" },
        identity: { org_ref: { org_id: "PEER-001", org_uri: "steward://tenant/mal" } },
        event: {
          type: "org.transaction.recorded",
          payload: {
            transaction_id: "TX-DEMO-MESH",
            direction: "outbound",
            contract_id: "CTR-012",
            summary: "demo:mesh-deliver fixture",
          },
        },
      })
    );

    const result = await deliverEnvelopeViaMesh(envelope, "PEER-003");
    if (!result.delivered) {
      throw new Error(`mesh deliver failed: ${result.reason}`);
    }

    const inboxPath = join(getProtocolInboxDir(), `${eventId}.json`);
    console.log(`✓ mesh hops: ${result.hops?.join(" → ")}`);
    console.log(`  POST order: ${postOrder.join(" → ")}`);
    console.log(`  inbox: ${inboxPath}`);
    console.log("\n--- Summary ---");
    console.log("Flow: mesh route via chain → relay hop → push hop → inbox mirror");
  } finally {
    hop1.close();
    hop2.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
