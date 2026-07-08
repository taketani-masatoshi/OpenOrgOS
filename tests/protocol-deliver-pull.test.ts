import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, getDocsDir, getDataDir } from "../src/lib/utils.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { pullDeliverFromPeerOutbox } from "../src/lib/protocol/transport.js";
import { resolvePeerOutboxBaseUrl } from "../src/lib/protocol/peers.js";
import { getProtocolOutboxDir, getProtocolInboxDir } from "../src/lib/protocol/paths.js";
import { serializeEventEnvelope } from "../src/lib/protocol/envelope.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";

const VENDOR = "southwood";
const BUYER = "mal";

function cleanupTenantProtocol(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol deliver-pull E2E", () => {
  let closeServer: (() => void) | undefined;
  let apiBase = "";

  beforeEach(() => {
    closeServer = undefined;
    apiBase = "";
  });

  afterEach(() => {
    closeServer?.();
    setTenantId(BUYER);
    cleanupTenantProtocol();
    setTenantId(VENDOR);
    cleanupTenantProtocol();
  });

  it("pulls envelope from peer outbox API into local inbox (mal ← southwood)", async () => {
    const eventId = randomUUID();

    setTenantId(VENDOR);
    cleanupTenantProtocol();
    ensureProtocolSigningKey();

    const envelope = maybeSignEnvelope(
      eventEnvelopeSchema.parse({
        protocol_version: "1",
        event_id: eventId,
        occurred_at: "2026-06-27T10:00:00.000Z",
        origin: { org_id: "PEER-002", org_uri: `steward://tenant/${VENDOR}` },
        destination: { org_id: "PEER-001", org_uri: `steward://tenant/${BUYER}` },
        identity: { org_ref: { org_id: "PEER-002", org_uri: `steward://tenant/${VENDOR}` } },
        event: {
          type: "org.transaction.recorded",
          payload: {
            transaction_id: "TX-PULL-001",
            direction: "outbound",
            contract_id: "CTR-012",
            summary: "deliver-pull E2E fixture",
          },
        },
      })
    );

    const outboxDir = getProtocolOutboxDir();
    mkdirSync(outboxDir, { recursive: true });
    writeFileSync(join(outboxDir, `${eventId}.json`), serializeEventEnvelope(envelope), "utf-8");

    const server = await startProtocolApiServer({
      host: "127.0.0.1",
      port: 0,
      tenantId: VENDOR,
    });
    closeServer = server.close;
    apiBase = server.url;

    setTenantId(BUYER);
    cleanupTenantProtocol();
    const peer = registerPeer({
      peer_id: "PEER-002",
      display_name: "Southwood",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${VENDOR}`,
      inbound_endpoints: [{ url: apiBase, priority: 1, mode: "pull" }],
    });
    const outboxBase = resolvePeerOutboxBaseUrl(peer);
    expect(outboxBase).toBe(apiBase);

    const result = await pullDeliverFromPeerOutbox(apiBase, eventId);
    expect(result.delivered).toBe(true);
    expect(result.inboxPath).toBeTruthy();

    const inboxPath = join(getProtocolInboxDir(), `${eventId}.json`);
    expect(existsSync(inboxPath)).toBe(true);
    const pulled = JSON.parse(readFileSync(inboxPath, "utf-8"));
    expect(pulled.event_id).toBe(eventId);
    expect(pulled.event.type).toBe("org.transaction.recorded");
  });
});
