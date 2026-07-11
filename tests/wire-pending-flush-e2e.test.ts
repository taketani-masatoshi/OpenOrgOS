import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  enqueueWirePending,
  listWirePending,
  saveWirePending,
} from "../src/lib/protocol/wire-queue.js";
import {
  deliverProtocolEnvelopeWithRelay,
  flushWirePending,
} from "../src/lib/protocol/transport.js";
import { getWireDeadLetterAuditPath } from "../src/lib/protocol/wire-dead-letter-audit.js";
import { computeNextRetryAt, WIRE_PENDING_MAX_ATTEMPTS } from "../src/lib/protocol/wire-pending-retry.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { isWireDelivered } from "../src/lib/protocol/wire-delivered.js";
import { listDeliveryAttempts } from "../src/lib/protocol/delivery-ledger.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("wire pending flush E2E", () => {
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
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("flushWirePending skips entries before next_retry_at", async () => {
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

    const future = computeNextRetryAt(1, Date.now() + 3600_000);
    enqueueWirePending({
      peer_id: "PEER-001",
      event_id: envelope.event_id,
      envelope_digest: "a".repeat(64),
      attempts: 1,
      next_retry_at: future,
      last_error: "HTTP 503",
    });

    expect(listWirePending()).toHaveLength(1);
    expect(await flushWirePending()).toBe(0);
    expect(listWirePending()).toHaveLength(1);
  });

  it("flushWirePending logs dead-letter audit at max attempts", async () => {
    const auditPath = getWireDeadLetterAuditPath();
    if (existsSync(auditPath)) rmSync(auditPath);

    enqueueWirePending({
      peer_id: "PEER-001",
      event_id: "00000000-0000-4000-8000-000000000099",
      envelope_digest: "b".repeat(64),
      attempts: WIRE_PENDING_MAX_ATTEMPTS,
      last_error: "exhausted",
    });

    expect(await flushWirePending()).toBe(0);
    expect(listWirePending()).toHaveLength(0);
    expect(existsSync(auditPath)).toBe(true);
  });

  it("queues a temporary 503 then retries to 202 and records delivery", async () => {
    let responseStatus = 503;
    let requests = 0;
    const receiver = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/wire/v1/events") {
        requests++;
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: responseStatus === 202 }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    const port = typeof address === "object" && address ? address.port : 0;

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Retry peer",
      jurisdiction: "JP",
      org_uri: "steward://tenant/retry-peer",
      inbound_endpoints: [
        {
          url: `http://127.0.0.1:${port}/wire/v1/events`,
          transport: "wire_v1",
          mode: "push",
          priority: 1,
        },
      ],
    });
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-RETRY",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    try {
      const first = await deliverProtocolEnvelopeWithRelay(envelope, "PEER-001");
      expect(first).toMatchObject({ delivered: false, queued: true });
      expect(first.reason).toContain("HTTP 503");
      expect(listWirePending()).toHaveLength(1);
      expect(isWireDelivered("PEER-001", envelope.event_id)).toBe(false);

      const pending = listWirePending();
      saveWirePending({
        pending: pending.map((entry) => ({
          ...entry,
          next_retry_at: new Date(Date.now() - 1_000).toISOString(),
        })),
      });
      responseStatus = 202;

      expect(await flushWirePending()).toBe(1);
      expect(requests).toBe(2);
      expect(listWirePending()).toHaveLength(0);
      expect(isWireDelivered("PEER-001", envelope.event_id)).toBe(true);
      expect(
        listDeliveryAttempts({ eventId: envelope.event_id, peerId: "PEER-001" }).map(
          (attempt) => attempt.status
        )
      ).toEqual(["failed", "success"]);
    } finally {
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });
});
