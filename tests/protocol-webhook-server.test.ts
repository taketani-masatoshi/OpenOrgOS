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
import { startWebhookServer } from "../src/lib/webhook-server.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("webhook HTTP server protocol ingest", () => {
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
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("POST envelope to /steward/webhook records inbound tx", async () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sender",
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
    });

    const server = await startWebhookServer({ host: "127.0.0.1", port: 0, drain: false });
    try {
      const res = await fetch(server.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transmission.envelope),
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as { transaction_id?: string; inbox_path?: string };
      expect(body.transaction_id).toMatch(/^TX-/);
      expect(body.inbox_path).toBeTruthy();
      expect(existsSync(body.inbox_path!)).toBe(true);
    } finally {
      server.close();
    }
  });
});
