import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer, findPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import { resolvePeerInboundEndpoints } from "../src/lib/protocol/peers.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol multipath delivery", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
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

  it("falls back to secondary endpoint when primary fails", async () => {
    let primaryHits = 0;
    let secondaryHits = 0;

    const primary = createServer((_req, res) => {
      primaryHits++;
      res.writeHead(503);
      res.end();
    });
    const secondary = createServer((_req, res) => {
      secondaryHits++;
      res.writeHead(202);
      res.end("{}");
    });

    await new Promise<void>((r) => primary.listen(0, "127.0.0.1", () => r()));
    await new Promise<void>((r) => secondary.listen(0, "127.0.0.1", () => r()));
    const primaryPort = (primary.address() as { port: number }).port;
    const secondaryPort = (secondary.address() as { port: number }).port;

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
      inbound_endpoints: [
        { url: `http://127.0.0.1:${primaryPort}/webhook`, priority: 1, mode: "push" },
        { url: `http://127.0.0.1:${secondaryPort}/webhook`, priority: 2, mode: "push" },
      ],
    });

    const endpoints = resolvePeerInboundEndpoints(findPeer("PEER-001")!);
    expect(endpoints).toHaveLength(2);

    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const result = await deliverProtocolEnvelope(envelope, "PEER-001");
    expect(result.delivered).toBe(true);
    expect(primaryHits).toBeGreaterThan(0);
    expect(secondaryHits).toBeGreaterThan(0);

    primary.close();
    secondary.close();
  });

  it("maps legacy inbound_webhook_url to single endpoint", () => {
    const peer = registerPeer({
      peer_id: "PEER-002",
      display_name: "Legacy",
      jurisdiction: "JP",
      inbound_webhook_url: "http://127.0.0.1:9999/steward/webhook",
    });
    const eps = resolvePeerInboundEndpoints(peer);
    expect(eps).toHaveLength(1);
    expect(eps[0]!.url).toContain("9999");
  });
});
