import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { verifyAuditChainExternal, verifyDelegationProofExternal } from "../src/lib/protocol/external-verify.js";
import { exportDelegationProof, buildDelegationEnvelope } from "../src/lib/protocol/delegation.js";
import { getProtocolAuditChainPath } from "../src/lib/protocol/paths.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { clearWireGovernanceCacheForTests } from "../src/lib/jurisdiction/wire-governance/index.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol external verify", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    clearWireGovernanceCacheForTests();
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
  });

  afterEach(() => cleanup());

  it("verifies delegation proof file", () => {
    const proof = exportDelegationProof({
      scope: "contract.sign",
      granteeAgent: "contract",
      basisRef: "REG-004",
    });
    const path = join(getDocsDir(), "protocol", "proof.json");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(proof), "utf-8");
    const result = verifyDelegationProofExternal(path);
    expect(result.ok).toBe(true);
  });

  it("verifies signed delegation envelope with grantor key binding", () => {
    ensureProtocolSigningKey();
    const proof = exportDelegationProof({
      scope: "contract.sign",
      granteeAgent: "contract",
      basisRef: "REG-004",
    });
    const envelope = buildDelegationEnvelope(proof);
    expect(envelope.signature).toBeTruthy();
    const path = join(getDocsDir(), "protocol", "delegation-envelope.json");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(envelope), "utf-8");
    const result = verifyDelegationProofExternal(path);
    expect(result.ok).toBe(true);
  });

  it("verifies audit chain digests against outbox envelopes", () => {
    const tx = recordProtocolTransaction({
      transactionType: "obligation.acknowledged",
      peerId: "PEER-001",
      operatorBypass: true,
    });
    expect(tx.outboxPath).toBeTruthy();

    const result = verifyAuditChainExternal({ requireEnvelopes: false });
    expect(result.ok).toBe(true);
    expect(result.checked).toBeGreaterThan(0);
    expect(existsSync(getProtocolAuditChainPath())).toBe(true);
  });
});
