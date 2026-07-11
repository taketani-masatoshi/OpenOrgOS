import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { buildWireMimeMessage } from "../src/lib/protocol/email-wire-deliver.js";
import {
  parseWireEml,
  scanMailReceivedForWire,
  ingestWireFromEmail,
} from "../src/lib/protocol/email-wire-ingest.js";
import { getMailReceivedDir } from "../src/lib/correspondence/paths.js";
import {
  proposeInterOrgNotice,
  approveInterOrgNotice,
} from "../src/lib/wire/index.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  const received = getMailReceivedDir();
  if (existsSync(received)) rmSync(received, { recursive: true, force: true });
}

describe("protocol email_wire ingest", () => {
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
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Sender Org",
      jurisdiction: "JP",
      org_uri: "steward://tenant/demo",
      protocol_public_key: exportProtocolPublicKeyBase64(),
    });
    ensureProtocolSigningKey();
    mkdirSync(getMailReceivedDir(), { recursive: true });
  });

  afterEach(() => cleanup());

  function sampleEnvelope(eventId = "33333333-3333-4333-8333-333333333333") {
    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops",
    });
    const { transmission } = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "Demo CEO",
      eventId,
    });
    return transmission.envelope;
  }

  it("ingests wire attachment from eml fixture", async () => {
    const envelope = sampleEnvelope();
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@demo.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
    });
    const emlPath = join(getMailReceivedDir(), "wire-notice.eml");
    writeFileSync(emlPath, mime, "utf-8");

    const parsed = await parseWireEml(emlPath);
    expect(parsed).not.toBeNull();
    expect(parsed?.wire?.eventId ?? parsed?.eventId).toBe(envelope.event_id);

    const result = await scanMailReceivedForWire();
    expect(result.ingested).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("is idempotent on duplicate ingest", async () => {
    const envelope = sampleEnvelope("44444444-4444-4444-8444-444444444444");
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@demo.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
    });
    const emlPath = join(getMailReceivedDir(), "wire-dup.eml");
    writeFileSync(emlPath, mime, "utf-8");

    const first = ingestWireFromEmail(await parseWireEml(emlPath));
    const second = ingestWireFromEmail(await parseWireEml(emlPath));
    expect(first.ok).toBe(true);
    expect(second.idempotent).toBe(true);
  });

  it("rejects invalid wire attachment JSON", async () => {
    const envelope = sampleEnvelope("55555555-5555-4555-8555-555555555555");
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@demo.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
      wireJson: "{not-valid-json",
    });
    const emlPath = join(getMailReceivedDir(), "wire-bad-json.eml");
    writeFileSync(emlPath, mime, "utf-8");

    const parsed = await parseWireEml(emlPath);
    expect(parsed).toBeNull();

    const result = await scanMailReceivedForWire();
    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("ingests wire payload when MTA folded long JSON lines", async () => {
    const envelope = sampleEnvelope("77777777-7777-4777-8777-777777777777");
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@demo.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
    });
    const folded = mime.replace(
      /("approval_policy_ref":"REG-004")/,
      '"approval_po\r\n licy_ref":"REG-004"'
    );
    const emlPath = join(getMailReceivedDir(), "wire-folded.eml");
    writeFileSync(emlPath, folded, "utf-8");

    const parsed = await parseWireEml(emlPath);
    expect(parsed).not.toBeNull();

    const result = await scanMailReceivedForWire();
    expect(result.ingested).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid wire signature hash", async () => {
    const envelope = sampleEnvelope("66666666-6666-4666-8666-666666666666");
    const mime = buildWireMimeMessage(envelope, {
      to: "wire@demo.example",
      fromName: "Wire",
      fromEmail: "wire@demo.example",
    });
    const emlPath = join(getMailReceivedDir(), "wire-bad-hash.eml");
    writeFileSync(emlPath, mime, "utf-8");

    const parsed = await parseWireEml(emlPath);
    expect(parsed).not.toBeNull();
    if (parsed?.wire) parsed.wire.hash = "deadbeef".repeat(8);
    const result = ingestWireFromEmail(parsed);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hash|signature/i);
  });
});
