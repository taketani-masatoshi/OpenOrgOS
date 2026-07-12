import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";
import { envelopeDigest } from "../src/lib/protocol/canonical.js";
import { protocolFetch } from "../src/lib/protocol/protocol-tls.js";
import {
  generateProtocolKeyPair,
  signEventEnvelope,
} from "../src/lib/protocol/signing.js";
import type { WireInternalClient } from "../src/lib/wire-gateway/internal-client.js";
import { createOutboundPoller } from "../src/lib/wire-gateway/outbound-poller.js";
import { startWireGatewayServer } from "../src/lib/wire-gateway/server.js";
import { allocateEphemeralPort } from "./helpers/ephemeral-port.js";

const LOCAL_DID = "did:ooo:org:pk-1111111111111111";
const SENDER_DID = "did:ooo:org:pk-2222222222222222";
const SENDER_URI = "steward://tenant/security-sender";
const PROXY_IP = "203.0.113.7";

function openssl(cwd: string, ...args: string[]): void {
  execFileSync("openssl", args, { cwd, stdio: "ignore" });
}

function generateTlsFixtures(dir: string): {
  ca: string;
  serverCert: string;
  serverKey: string;
  clientCert: string;
  clientKey: string;
  deniedCert: string;
  deniedKey: string;
} {
  openssl(
    dir,
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", "ca.key", "-out", "ca.crt", "-days", "1", "-subj", "/CN=Wire Test CA"
  );
  openssl(
    dir,
    "req", "-newkey", "rsa:2048", "-nodes",
    "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=127.0.0.1"
  );
  execFileSync(
    "openssl",
    [
      "x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
      "-CAcreateserial", "-out", "server.crt", "-days", "1",
      "-extfile", "/dev/stdin",
    ],
    { cwd: dir, input: "subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n", stdio: ["pipe", "ignore", "ignore"] }
  );

  for (const [name, uri] of [
    ["client", SENDER_URI],
    ["denied", "steward://tenant/not-allowed"],
  ] as const) {
    openssl(
      dir,
      "req", "-newkey", "rsa:2048", "-nodes",
      "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${name}`
    );
    execFileSync(
      "openssl",
      [
        "x509", "-req", "-in", `${name}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key",
        "-CAserial", "ca.srl", "-out", `${name}.crt`, "-days", "1",
        "-extfile", "/dev/stdin",
      ],
      {
        cwd: dir,
        input: `subjectAltName=URI:${uri}\nextendedKeyUsage=clientAuth\n`,
        stdio: ["pipe", "ignore", "ignore"],
      }
    );
  }

  return {
    ca: join(dir, "ca.crt"),
    serverCert: join(dir, "server.crt"),
    serverKey: join(dir, "server.key"),
    clientCert: join(dir, "client.crt"),
    clientKey: join(dir, "client.key"),
    deniedCert: join(dir, "denied.crt"),
    deniedKey: join(dir, "denied.key"),
  };
}

describe("wire-gateway security runtime E2E", () => {
  let dir: string;
  let previousStrictTrust: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orgos-wire-security-"));
    previousStrictTrust = process.env.ORGOS_STRICT_TRUST;
    process.env.ORGOS_STRICT_TRUST = "1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousStrictTrust === undefined) delete process.env.ORGOS_STRICT_TRUST;
    else process.env.ORGOS_STRICT_TRUST = previousStrictTrust;
    rmSync(dir, { recursive: true, force: true });
  });

  it("enforces CA mTLS, org URI, proxy IP, receiver, gossip, rate, skew, and pk-DID", async () => {
    const tls = generateTlsFixtures(dir);
    const senderKeys = generateProtocolKeyPair();
    let accepted = 0;
    const peer = {
      peer_node_id: SENDER_DID,
      peer_node_uri: SENDER_URI,
      peer_did: SENDER_DID,
      protocol_public_key: senderKeys.publicKey,
      transport: "wire_v1" as const,
    };
    const internalClient = {
      async getNode() {
        return {
          ok: true as const,
          node: {
            node_id: LOCAL_DID,
            did: LOCAL_DID,
            protocol_public_key: "test-public-key",
            wire_version: "0.1" as const,
          },
        };
      },
      async getPeers() {
        return [peer];
      },
      async submitInbox() {
        accepted += 1;
        return { status: 202, result: { ok: true } };
      },
    } as unknown as WireInternalClient;

    const listenPort = await allocateEphemeralPort();
    const config = wireGatewayConfigSchema.parse({
      node_id: LOCAL_DID,
      node_uri: "steward://tenant/security-local",
      did: LOCAL_DID,
      listen: {
        host: "127.0.0.1",
        port: listenPort,
        tls_cert: tls.serverCert,
        tls_key: tls.serverKey,
        tls_ca: tls.ca,
      },
      internal_api: { base_url: "http://127.0.0.1:1/internal/v1/wire" },
      security: {
        mtls_required: true,
        mtls_allowed_org_uris: [SENDER_URI],
        trusted_proxies: ["127.0.0.1"],
        ip_allowlist: [PROXY_IP],
        rate_limit_per_min: 8,
        timestamp_skew_sec: 30,
      },
      audit: { path: join(dir, "audit.jsonl") },
    });
    const gateway = await startWireGatewayServer({
      config,
      internalClient,
      enableOutbound: false,
      nonceLedgerPath: join(dir, "nonce-ledger.json"),
    });

    const makeWire = (
      sender = SENDER_DID,
      receiver = LOCAL_DID,
      occurredAt = new Date().toISOString()
    ) => {
      const envelope = {
        protocol_version: "1" as const,
        event_id: randomUUID(),
        occurred_at: occurredAt,
        origin: { org_id: sender, org_uri: `steward://tenant/${sender}` },
        destination: {
          org_id: receiver,
          org_uri: `steward://tenant/${receiver}`,
        },
        identity: {
          org_ref: { org_id: sender, org_uri: SENDER_URI },
        },
        event: {
          type: "org.identity.presented",
          payload: { security_e2e: true },
        },
      };
      const signed = signEventEnvelope(envelope, senderKeys.privateKeyPem);
      return {
        wireVersion: "0.1" as const,
        protocolVersion: "1" as const,
        eventId: signed.event_id,
        eventType: signed.event.type,
        sender,
        receiver,
        timestamp: signed.occurred_at,
        nonce: randomUUID(),
        hash: envelopeDigest(signed),
        signature: signed.signature!,
        payload: signed.event.payload,
        identity: signed.identity,
      };
    };
    const request = (
      path: string,
      body: unknown,
      cert: "allowed" | "denied" | "none" = "allowed",
      forwardedFor = PROXY_IP
    ) =>
      protocolFetch(`${gateway.url}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": forwardedFor,
        },
        body: JSON.stringify(body),
        tls: {
          ca_path: tls.ca,
          cert_path:
            cert === "allowed" ? tls.clientCert : cert === "denied" ? tls.deniedCert : undefined,
          key_path:
            cert === "allowed" ? tls.clientKey : cert === "denied" ? tls.deniedKey : undefined,
          reject_unauthorized: true,
        },
      });

    try {
      const spoofedXff = await request("/wire/v1/events", makeWire(), "allowed", "198.51.100.9");
      expect(spoofedXff.status).toBe(403);
      expect(await spoofedXff.json()).toMatchObject({ error: "ip_denied" });

      expect((await request("/wire/v1/events", makeWire(), "none")).status).toBe(401);
      expect((await request("/wire/v1/events", makeWire(), "denied")).status).toBe(401);

      const wrongReceiver = await request(
        "/wire/v1/events",
        makeWire(SENDER_DID, "did:ooo:org:pk-9999999999999999")
      );
      expect(wrongReceiver.status).toBe(403);
      expect(await wrongReceiver.json()).toMatchObject({ error: "receiver_mismatch" });

      const stale = await request(
        "/wire/v1/events",
        makeWire(SENDER_DID, LOCAL_DID, new Date(Date.now() - 120_000).toISOString())
      );
      expect(stale.status).toBe(403);
      expect(await stale.json()).toMatchObject({ error: "timestamp_skew" });

      const slug = await request("/wire/v1/events", makeWire("did:ooo:org:legacy-slug"));
      expect(slug.status).toBe(403);
      expect(await slug.json()).toMatchObject({ error: "sender_pk_did_required" });

      const unknownGossip = await request("/wire/v1/federation/gossip", {
        version: "1",
        gossip_at: new Date().toISOString(),
        publisher_node_id: "unknown",
        nodes: [],
      });
      expect(unknownGossip.status).toBe(403);
      expect(await unknownGossip.json()).toMatchObject({ error: "gossip_peer_unknown" });

      const gossip = await request("/wire/v1/federation/gossip", {
        version: "1",
        gossip_at: new Date().toISOString(),
        publisher_node_id: SENDER_DID,
        nodes: [],
      });
      expect(gossip.status).toBe(202);

      const valid = await request("/wire/v1/events", makeWire());
      expect(valid.status).toBe(202);
      expect(accepted).toBe(1);

      const limited = await request("/wire/v1/events", makeWire());
      expect(limited.status).toBe(429);
      expect(await limited.json()).toMatchObject({ error: "rate_limited" });
    } finally {
      gateway.close();
    }
  }, 30_000);

  it("rejects slug-DID on the gateway outbound runtime before network delivery", async () => {
    const senderKeys = generateProtocolKeyPair();
    const unsigned = {
      protocol_version: "1" as const,
      event_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      origin: { org_id: "did:ooo:org:legacy-sender" },
      destination: { org_id: LOCAL_DID },
      identity: { org_ref: { org_id: "did:ooo:org:legacy-sender" } },
      event: { type: "org.identity.presented", payload: {} },
    };
    const envelope = signEventEnvelope(unsigned, senderKeys.privateKeyPem);
    let receiptDetail: string | undefined;
    const internalClient = {
      async listOutbox() {
        return [
          {
            event_id: envelope.event_id,
            receiver_node_id: LOCAL_DID,
            enqueued_at: new Date().toISOString(),
            envelope_digest: envelopeDigest(envelope),
          },
        ];
      },
      async getPeers() {
        return [
          {
            peer_node_id: LOCAL_DID,
            peer_did: LOCAL_DID,
            wire_endpoint: "https://receiver.invalid/wire/v1/events",
            transport: "wire_v1" as const,
          },
        ];
      },
      async getOutboxEnvelope() {
        return envelope;
      },
      async reportDelivered(_eventId: string, receipt: { detail?: string }) {
        receiptDetail = receipt.detail;
      },
    } as unknown as WireInternalClient;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const listenPort = await allocateEphemeralPort();
    const config = wireGatewayConfigSchema.parse({
      node_id: "legacy-sender",
      did: "did:ooo:org:legacy-sender",
      listen: { host: "127.0.0.1", port: listenPort },
      internal_api: { base_url: "http://127.0.0.1:1/internal/v1/wire" },
      audit: { path: join(dir, "outbound-audit.jsonl") },
    });

    await createOutboundPoller(config, internalClient).pollOnce();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(receiptDetail).toBe("sender_pk_did_required");
  });
});
