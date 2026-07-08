import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import {
  emitWitnessAttestationRegistered,
  emitWitnessReceiptIssued,
} from "../src/lib/protocol/witness-envelope-emit.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { witnessAttestationSchema } from "../schemas/protocol/witness-attestation.js";
import { witnessReceiptSchema } from "../schemas/protocol/witness-receipt.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("org.witness.* envelope emit", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("appends org.witness.attestation.registered to audit chain", () => {
    const attestation = witnessAttestationSchema.parse({
      event_id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      envelope_digest: "a".repeat(64),
      side: "sent",
      origin: { org_id: "demo" },
      destination: { org_id: "peer" },
      transaction_type: "contract.execution.notice",
      attested_at: new Date().toISOString(),
      org_ref: { org_id: "demo" },
      org_public_key: "key",
      org_signature: "sig",
    });
    const envelope = emitWitnessAttestationRegistered(attestation, "HUB-A");
    expect(envelope.event.type).toBe("org.witness.attestation.registered");
    const chain = loadProtocolAuditChain();
    expect(chain.some((r) => r.event_id === envelope.event_id)).toBe(true);
  });

  it("appends org.witness.receipt.issued to audit chain", () => {
    const receipt = witnessReceiptSchema.parse({
      receipt_id: "WRCPT-1",
      event_id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      envelope_digest: "b".repeat(64),
      status: "mutually_confirmed",
      attestations: [],
      issued_at: new Date().toISOString(),
      hub_id: "HUB-A",
      hub_signature: "sig",
    });
    const envelope = emitWitnessReceiptIssued(receipt);
    expect(envelope.event.type).toBe("org.witness.receipt.issued");
    expect(loadProtocolAuditChain().length).toBeGreaterThan(0);
  });
});
