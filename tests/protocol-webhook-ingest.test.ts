import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  proposeInterOrgNotice,
  approveInterOrgNotice,
} from "../src/lib/wire/index.js";
import { ingestWebhook } from "../src/lib/webhook.js";
import {
  exportProtocolPublicKeyBase64,
  ensureProtocolSigningKey,
} from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol webhook ingest", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Lease
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 85000
`,
      "utf-8"
    );
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sender Org",
      jurisdiction: "JP",
      org_uri: "steward://tenant/sender-org",
    });
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("records inbound execution notice resolving peer by origin.org_uri", () => {
    const senderPublicKey = exportProtocolPublicKeyBase64()!;
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sender Org",
      jurisdiction: "JP",
      org_uri: "steward://tenant/demo",
      protocol_public_key: senderPublicKey,
    });

    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops",
    });
    const { transmission } = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      eventId: "22222222-2222-4222-8222-222222222222",
    });

    const result = ingestWebhook({ raw: transmission.envelope });
    expect(result.ok).toBe(true);
    expect(result.transactionId).toMatch(/^TX-/);
    expect(result.verificationIssues ?? []).toHaveLength(0);
  });

  it("returns existing tx on duplicate event_id ingest (idempotent)", () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sender Org",
      jurisdiction: "JP",
      org_uri: "steward://tenant/demo",
      protocol_public_key: exportProtocolPublicKeyBase64(),
    });

    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops",
    });
    const { transmission } = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      eventId: "33333333-3333-4333-8333-333333333333",
    });

    const first = ingestWebhook({ raw: transmission.envelope });
    const second = ingestWebhook({ raw: transmission.envelope });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.idempotent).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
  });
});
