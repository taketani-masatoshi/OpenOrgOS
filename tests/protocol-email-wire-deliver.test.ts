import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import {
  buildWireMimeMessage,
  deliverEnvelopeViaEmailWire,
  assertEmailWireAllowed,
  EMAIL_WIRE_MAX_BYTES,
} from "../src/lib/protocol/email-wire-deliver.js";
import { registerPeer } from "../src/lib/protocol/peers.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  const records = join(getDataDir(), "..", "records", "executive");
  if (existsSync(records)) rmSync(records, { recursive: true, force: true });
}

describe("protocol email_wire deliver", () => {
  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_SKIP_DELIVER_VALIDATE = "1";
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
    mkdirSync(join(getDataDir(), "..", "records", "executive"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "..", "records", "executive", "mail-config.yaml"),
      `provider: dry_run
from:
  name: Demo Secretary
  email: secretary@demo.example
wire_outbound:
  enabled: true
  from:
    name: Demo Wire
    email: wire-notices@demo.example
  smtp:
    host: smtp.test.local
    port: 587
`,
      "utf-8"
    );
  });

  afterEach(() => {
    delete process.env.STEWARD_SKIP_DELIVER_VALIDATE;
    delete process.env.ORGOS_STRICT_TRUST;
    cleanup();
  });

  function sampleEnvelope() {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
    });
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    return recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    }).envelope;
  }

  it("builds MIME with OpenOrgOS headers and wire attachment", () => {
    const envelope = sampleEnvelope();
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@peer.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
    });
    expect(mime).toContain("X-OpenOrgOS-Event-Id:");
    expect(mime).toContain("X-OpenOrgOS-Transport: email_wire");
    expect(mime).toContain("application/vnd.openorgos.wire+json");
    const plainSection = mime.split("application/vnd.openorgos.wire+json")[0] ?? mime;
    expect(plainSection).not.toContain("50000");
  });

  it("E12 rejects self-delivery to own wire_email", () => {
    expect(() =>
      assertEmailWireAllowed({
        to: "wire-notices@demo.example",
        fromEmail: "wire-notices@demo.example",
        messageBytes: 100,
      })
    ).toThrow(/E12/);
  });

  it("E11 rejects oversized messages", () => {
    expect(() =>
      assertEmailWireAllowed({
        to: "wire@peer.example",
        fromEmail: "wire@demo.example",
        messageBytes: EMAIL_WIRE_MAX_BYTES + 1,
      })
    ).toThrow(/E11/);
  });

  it("delivers via dry_run when smtp.test.local", async () => {
    const peer = registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
      wire_email: "wire@peer.example",
      inbound_endpoints: [
        {
          url: "smtp://wire@peer.example",
          transport: "email_wire",
          priority: 90,
          mode: "push",
        },
      ],
    });
    const envelope = sampleEnvelope();
    const result = await deliverEnvelopeViaEmailWire(envelope, peer, "smtp://wire@peer.example");
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry_run");
    expect(result.artifactPath).toBeDefined();
  });
});
