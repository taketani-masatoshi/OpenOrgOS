#!/usr/bin/env node
/**
 * 2-tenant outbox pull demo — southwood serves outbox · mal pulls into inbox
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { registerPeer, resolvePeerOutboxBaseUrl, findPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { pullDeliverFromPeerOutbox } from "../src/lib/protocol/transport.js";
import { getProtocolOutboxDir, getProtocolInboxDir } from "../src/lib/protocol/paths.js";
import { serializeEventEnvelope } from "../src/lib/protocol/envelope.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";

const VENDOR = "southwood";
const BUYER = "mal";

async function main(): Promise<void> {
  if (!existsSync(join(ROOT_DIR, "tenants", VENDOR, "tenant.yaml"))) {
    console.error(`Tenant ${VENDOR} not found`);
    process.exit(1);
  }

  const eventId = randomUUID();
  console.log(`Deliver-pull demo — ${BUYER} ← ${VENDOR} · event_id ${eventId}\n`);

  setTenantId(VENDOR);
  ensureProtocolSigningKey();
  const envelope = maybeSignEnvelope(
    eventEnvelopeSchema.parse({
      protocol_version: "1",
      event_id: eventId,
      occurred_at: new Date().toISOString(),
      origin: { org_id: "PEER-002", org_uri: `steward://tenant/${VENDOR}` },
      destination: { org_id: "PEER-001", org_uri: `steward://tenant/${BUYER}` },
      identity: { org_ref: { org_id: "PEER-002", org_uri: `steward://tenant/${VENDOR}` } },
      event: {
        type: "org.transaction.recorded",
        payload: {
          transaction_id: "TX-DEMO-PULL",
          direction: "outbound",
          contract_id: "CTR-012",
          summary: "demo:deliver-pull fixture",
        },
      },
    })
  );

  const outboxDir = getProtocolOutboxDir();
  mkdirSync(outboxDir, { recursive: true });
  writeFileSync(join(outboxDir, `${eventId}.json`), serializeEventEnvelope(envelope), "utf-8");
  console.log(`[${VENDOR}] outbox: ${join(outboxDir, `${eventId}.json`)}`);

  const server = await startProtocolApiServer({
    host: "127.0.0.1",
    port: 9476,
    tenantId: VENDOR,
  });
  console.log(`[${VENDOR}] protocol API: ${server.url}`);

  try {
    setTenantId(BUYER);
    registerPeer({
      peer_id: "PEER-002",
      display_name: "Southwood",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${VENDOR}`,
      inbound_endpoints: [{ url: server.url, priority: 1, mode: "pull" }],
    });

    const peer = findPeer("PEER-002");
    const base = peer ? resolvePeerOutboxBaseUrl(peer) : undefined;
    if (!base) {
      throw new Error("peer outbox base URL not resolved");
    }

    const result = await pullDeliverFromPeerOutbox(base, eventId);
    if (!result.delivered) {
      throw new Error(`pull failed: ${result.reason}`);
    }

    const inboxPath = join(getProtocolInboxDir(), `${eventId}.json`);
    console.log(`[${BUYER}] ✓ pulled to inbox: ${inboxPath}`);
    console.log("\n--- Summary ---");
    console.log("Flow: vendor outbox → protocol API GET → buyer inbox mirror");
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
