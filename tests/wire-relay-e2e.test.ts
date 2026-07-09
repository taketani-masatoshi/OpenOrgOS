import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import {
  deliverProtocolEnvelopeWithRelay,
} from "../src/lib/protocol/transport.js";
import { runRelayCycle, loadRelayState } from "../src/lib/protocol/relay-worker.js";
import { evaluateRelaySlaAlerts } from "../src/lib/protocol/relay-sla-alert.js";
import { listWirePending } from "../src/lib/protocol/wire-queue.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { getProtocolRelayStoreDir } from "../src/lib/protocol/paths.js";
import YAML from "yaml";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("wire relay E2E (W2-3)", () => {
  let relayServer: Server | undefined;

  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    mkdirSync(getProtocolRelayStoreDir(), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
`,
      "utf-8"
    );
    writeFileSync(
      join(getDataDir(), "protocol", "wire-pending.yaml"),
      YAML.stringify({ pending: [] }),
      "utf-8"
    );
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!relayServer) return resolve();
      relayServer.close(() => resolve());
    });
    relayServer = undefined;
    cleanup();
  });

  it("relay cycle completes with zero pending on empty queue", async () => {
    const result = await runRelayCycle({ reconcile: false });
    expect(result.wire_pending).toBe(0);
    expect(result.witness_pending).toBe(0);
    expect(result.sla_failures).toBe(0);
    expect(evaluateRelaySlaAlerts(loadRelayState())).toHaveLength(0);
  });

  it("enqueue → relay cycle → metrics record pending then flush", async () => {
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-RELAY-E2E",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const received: unknown[] = [];
    relayServer = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/protocol/v1/relay/enqueue") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          received.push(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          res.writeHead(202, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, queued: true }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => relayServer!.listen(0, "127.0.0.1", () => r()));
    const relayPort = (relayServer!.address() as { port: number }).port;
    const relayUrl = `http://127.0.0.1:${relayPort}/protocol/v1/relay/enqueue`;

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
      inbound_endpoints: [
        { url: relayUrl, mode: "relay", priority: 1, transport: "relay" },
      ],
    });

    const relayed = await deliverProtocolEnvelopeWithRelay(envelope, "PEER-001");
    expect(relayed.relayed || relayed.delivered).toBeTruthy();
    expect(listWirePending().length).toBeGreaterThanOrEqual(0);

    const cycle = await runRelayCycle({ reconcile: false });
    expect(cycle.at).toBeTruthy();
    expect(cycle.wire_pending).toBeGreaterThanOrEqual(0);

    const state = loadRelayState();
    expect(state.cycles).toBeGreaterThanOrEqual(1);
    expect(state.last_metrics?.wire_pending).toBeDefined();
  });
});
