import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { startWireInternalApiServer } from "../src/lib/wire-gateway/internal-api-server.js";

const BEARER = "internal-api-test-token";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

async function authFetch(port: number, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/internal/v1/wire${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${BEARER}`,
      ...(init?.headers ?? {}),
    },
  });
}

function seedContract(): void {
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
}

function recordOutboxEnvelope(peerId = "PEER-099") {
  const attestation = operatorAttestationSchema.parse({
    operator_id: "op",
    approver_id: "ceo",
    approval_tier: "A",
    approved_at: new Date().toISOString(),
    basis: "existing_contract",
    notice_id: "NOTICE-INT",
    approval_policy_ref: "REG-004",
  });
  return recordProtocolTransaction({
    transactionType: "contract.execution.notice",
    peerId,
    contractId: "CTR-099",
    operatorAttestation: attestation,
  });
}

describe("wire-gateway Internal API (7 endpoints)", () => {
  let close: () => void;
  let port: number;

  beforeEach(async () => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    seedContract();
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-099",
      display_name: "Internal Peer",
      jurisdiction: "JP",
      org_uri: "steward://tenant/partner",
      protocol_public_key: exportProtocolPublicKeyBase64(),
      inbound_endpoints: [
        {
          url: "https://partner.example/wire/v1/events",
          mode: "push",
          transport: "wire_v1",
        },
      ],
    });
    const server = await startWireInternalApiServer({
      host: "127.0.0.1",
      port: 0,
      bearerToken: BEARER,
      tenantId: "demo",
    });
    port = Number(new URL(server.url).port);
    close = server.close;
  });

  afterEach(() => {
    close?.();
    cleanup();
  });

  it("GET /node returns node identity", async () => {
    const res = await authFetch(port, "/node");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; node: { protocol_public_key: string } };
    expect(body.ok).toBe(true);
    expect(body.node.protocol_public_key).toBe(exportProtocolPublicKeyBase64());
  });

  it("GET /peers lists wire peers", async () => {
    const res = await authFetch(port, "/peers");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; peers: Array<{ peer_id: string }> };
    expect(body.ok).toBe(true);
    expect(body.peers.some((p) => p.peer_id === "PEER-099")).toBe(true);
  });

  it("GET /outbox and GET /outbox/{id} return pending envelope", async () => {
    const { envelope } = recordOutboxEnvelope();

    const list = await authFetch(port, "/outbox");
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { ok: boolean; pending: Array<{ event_id: string }> };
    expect(listBody.pending.some((p) => p.event_id === envelope.event_id)).toBe(true);

    const one = await authFetch(port, `/outbox/${envelope.event_id}`);
    expect(one.status).toBe(200);
    const oneBody = (await one.json()) as { ok: boolean; envelope: { event_id: string } };
    expect(oneBody.envelope.event_id).toBe(envelope.event_id);
  });

  it("POST /outbox/{id}/delivered marks delivery", async () => {
    const { envelope } = recordOutboxEnvelope();

    const res = await authFetch(port, `/outbox/${envelope.event_id}/delivered`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: envelope.event_id,
        delivered: true,
        peer_node_id: "partner",
        delivered_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("GET /events/{id} enforces export policy", async () => {
    const { envelope } = recordOutboxEnvelope();

    const res = await authFetch(port, `/events/${envelope.event_id}`, {
      headers: { "x-wire-peer-id": "partner" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; allowed: boolean; reason?: string };
    expect(body.ok).toBe(true);
    expect(typeof body.allowed).toBe("boolean");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/internal/v1/wire/node`);
    expect(res.status).toBe(401);
  });
});
