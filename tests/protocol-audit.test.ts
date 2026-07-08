import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import {
  appendProtocolAuditRecord,
  loadProtocolAuditChain,
  verifyProtocolAuditChain,
} from "../src/lib/protocol/audit-chain.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { envelopeDigest } from "../src/lib/protocol/canonical.js";
import { getProtocolAuditChainPath } from "../src/lib/protocol/paths.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol audit chain", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
    });
  });

  afterEach(() => cleanup());

  it("chains prev_audit_id and verifies integrity", () => {
    const doc = buildIdentityDocument();
    const env1 = buildIdentityEnvelope(doc);
    const env2 = buildIdentityEnvelope(doc);
    appendProtocolAuditRecord({ envelope: env1 });
    appendProtocolAuditRecord({ envelope: env2 });

    const chain = loadProtocolAuditChain();
    expect(chain.length).toBe(2);
    expect(chain[1]?.prev_audit_id).toBe(chain[0]?.audit_id);

    const envelopes = new Map([
      [env1.event_id, env1],
      [env2.event_id, env2],
    ]);
    const verify = verifyProtocolAuditChain({ envelopesByEventId: envelopes });
    expect(verify.ok).toBe(true);
  });

  it("links transaction id on record", () => {
    const result = recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      operatorBypass: true,
    });
    const chain = loadProtocolAuditChain();
    expect(chain[0]?.transaction_id).toBe(result.transaction.transaction_id);
    expect(chain[0]?.digest).toBe(envelopeDigest(result.envelope));
    expect(existsSync(getProtocolAuditChainPath())).toBe(true);
  });
});
