import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  deliverEnvelopeViaMesh,
  resolveMeshRoute,
} from "../src/lib/protocol/peer-mesh.js";
import { getMeshRoutesYamlPath, getProtocolInboxDir } from "../src/lib/protocol/paths.js";
import { mirrorInboundEnvelope } from "../src/lib/protocol/transport.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";
import { maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { parseEventEnvelope } from "../src/lib/protocol/envelope.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol mesh deliver E2E", () => {
  let hop1: ReturnType<typeof createServer>;
  let hop2: ReturnType<typeof createServer>;
  const postOrder: string[] = [];

  beforeEach(() => {
    postOrder.length = 0;
    setTenantId("mal");
    delete process.env.ORGOS_STRICT_TRANSPORT;
    delete process.env.ORGOS_STRICT_TLS;
    delete process.env.ORGOS_STRICT_TRUST;
    cleanup();
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    hop1?.close();
    hop2?.close();
    cleanup();
  });

  it("delivers via 2-hop mesh route in order and mirrors final inbox", async () => {
    hop1 = createServer((_req, res) => {
      postOrder.push("PEER-002");
      res.writeHead(202);
      res.end("{}");
    });
    hop2 = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        postOrder.push("PEER-003");
        const body = Buffer.concat(chunks).toString("utf-8");
        const envelope = parseEventEnvelope(JSON.parse(body));
        mirrorInboundEnvelope(envelope);
        res.writeHead(202);
        res.end("{}");
      });
    });

    await new Promise<void>((r) => hop1.listen(0, "127.0.0.1", () => r()));
    await new Promise<void>((r) => hop2.listen(0, "127.0.0.1", () => r()));
    const hop1Port = (hop1.address() as { port: number }).port;
    const hop2Port = (hop2.address() as { port: number }).port;

    registerPeer({
      peer_id: "PEER-002",
      display_name: "Hop1 relay",
      jurisdiction: "JP",
      inbound_endpoints: [
        { url: `http://127.0.0.1:${hop1Port}/relay`, priority: 1, mode: "relay" },
      ],
    });
    registerPeer({
      peer_id: "PEER-003",
      display_name: "Hop2 final",
      jurisdiction: "JP",
      inbound_endpoints: [
        { url: `http://127.0.0.1:${hop2Port}/webhook`, priority: 1, mode: "push" },
      ],
    });

    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeFileSync(
      getMeshRoutesYamlPath(),
      `routes:
  - destination_peer_id: PEER-003
    via:
      - PEER-002
      - PEER-003
`,
      "utf-8"
    );

    expect(resolveMeshRoute("PEER-003")).toEqual(["PEER-002", "PEER-003"]);

    const eventId = randomUUID();
    const envelope = maybeSignEnvelope(
      eventEnvelopeSchema.parse({
        protocol_version: "1",
        event_id: eventId,
        occurred_at: "2026-06-27T12:00:00.000Z",
        origin: { org_id: "PEER-001", org_uri: "steward://tenant/mal" },
        destination: { org_id: "PEER-003", org_uri: "steward://tenant/aiac" },
        identity: { org_ref: { org_id: "PEER-001", org_uri: "steward://tenant/mal" } },
        event: {
          type: "org.transaction.recorded",
          payload: {
            transaction_id: "TX-MESH-001",
            direction: "outbound",
            contract_id: "CTR-012",
            summary: "mesh deliver E2E",
          },
        },
      })
    );

    const result = await deliverEnvelopeViaMesh(envelope, "PEER-003");
    expect(result.delivered).toBe(true);
    expect(result.queued).toBeFalsy();
    expect(result.hops).toEqual(["PEER-002", "PEER-003"]);
    expect(postOrder).toEqual(["PEER-002", "PEER-003"]);

    const inboxPath = join(getProtocolInboxDir(), `${eventId}.json`);
    expect(existsSync(inboxPath)).toBe(true);
    const mirrored = JSON.parse(readFileSync(inboxPath, "utf-8"));
    expect(mirrored.event_id).toBe(eventId);
  });
});
