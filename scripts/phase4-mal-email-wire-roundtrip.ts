/**
 * Phase 4 — mal email_wire live roundtrip
 * Outbound SMTP (ai@malkk.com) → ai+wireloop@malkk.com → IMAP sync → wire scan ingest
 *
 * Env:
 *   PHASE4_SMTP_WAIT_MS — initial wait before first IMAP poll (default 45000)
 *   PHASE4_INGEST_RETRIES — IMAP+scan attempts after wait (default 3)
 *   PHASE4_INGEST_RETRY_MS — delay between retries (default 25000)
 *   PHASE4_CLEANUP_LOOPBACK=1 — remove PEER-003 after success
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR } from "../src/lib/tenant.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../src/lib/protocol/signing.js";
import { deriveOpenOrgDidFromPublicKey } from "../schemas/protocol/openorg-did.js";
import { loadPeersRegistry, registerPeer, savePeersRegistry } from "../src/lib/protocol/peers.js";
import { proposeInterOrgNotice, approveInterOrgNotice } from "../src/lib/wire/index.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import {
  getEmailWireEventConfirmation,
  listUnconfirmedEmailWireEvents,
} from "../src/lib/protocol/delivery-ledger.js";
import { syncMailReceive } from "../src/lib/correspondence/mail-receive-sync.js";
import { scanMailReceivedForWire } from "../src/lib/protocol/email-wire-ingest.js";
import {
  loadMailConfig,
  resolveWireOutboundConfig,
} from "../src/lib/correspondence/mail-config.js";
import { redactSecrets } from "../src/lib/protocol/redact-secrets.js";
import { runWirePilotHygiene } from "../src/lib/protocol/wire-pilot-hygiene.js";
import { listTransactions, removeTransactionsById } from "../src/lib/protocol/transactions.js";

const TENANT = process.env.ORGOS_TENANT ?? "mal";
const LOOP_PEER = "PEER-003";
const LOOP_WIRE_EMAIL = process.env.PHASE4_LOOP_WIRE_EMAIL ?? "ai+wireloop@malkk.com";

setTenantId(TENANT);

function requireLiveSmtp(): void {
  const wire = resolveWireOutboundConfig();
  if (wire.provider !== "smtp") {
    throw new Error(
      `wire outbound provider is ${wire.provider} — load deploy/mal-pilot/env/.env.mail-wire (ORGOS_SMTP_* / ORGOS_IMAP_*)`
    );
  }
  for (const key of [
    "ORGOS_SMTP_USER",
    "ORGOS_SMTP_PASSWORD",
    "ORGOS_IMAP_USER",
    "ORGOS_IMAP_PASSWORD",
  ]) {
    if (!process.env[key]?.trim()) {
      throw new Error(`${key} missing — source .env.mail-wire before live roundtrip`);
    }
  }
}

function writeDiag(payload: Record<string, unknown>): string {
  const dir = join(ROOT_DIR, "scratch");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `phase4-diag-${TENANT}-${stamp}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
  return path;
}

function cleanupLoopbackPeer(): void {
  const registry = loadPeersRegistry();
  const next = registry.peers.filter((p) => p.peer_id !== LOOP_PEER);
  if (next.length === registry.peers.length) return;
  savePeersRegistry({ ...registry, peers: next });
  console.log(`✓ Removed loopback ${LOOP_PEER}`);
}

function cleanupLoopbackTransaction(eventId: string): void {
  const transactionIds = listTransactions()
    .filter((transaction) => transaction.event_id === eventId)
    .map((transaction) => transaction.transaction_id);
  const removed = removeTransactionsById(transactionIds);
  if (removed.length > 0) {
    console.log(`✓ Removed ${removed.length} live verification transaction(s)`);
  }
}

async function main(): Promise<void> {
  requireLiveSmtp();
  const hygiene = runWirePilotHygiene(TENANT);
  console.log(
    `✓ Wire hygiene · did ${hygiene.gateway_did} · loopback ${hygiene.loopback_peer} · mail ${hygiene.mail_config}`
  );

  const mail = loadMailConfig();
  const wireFrom = mail?.wire_outbound?.from?.email ?? "ai@malkk.com";
  if (wireFrom.toLowerCase() === LOOP_WIRE_EMAIL.toLowerCase()) {
    throw new Error(
      `PHASE4_LOOP_WIRE_EMAIL must differ from wire_outbound.from (${wireFrom}) — E12 self-delivery`
    );
  }

  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) throw new Error("protocol signing key missing");

  registerPeer({
    peer_id: LOOP_PEER,
    display_name: "MAL mail loopback (Phase 4)",
    jurisdiction: "JP",
    org_uri: `steward://tenant/${TENANT}`,
    did: deriveOpenOrgDidFromPublicKey(publicKey),
    protocol_public_key: publicKey,
    wire_email: LOOP_WIRE_EMAIL,
    inbound_endpoints: [
      {
        url: `smtp://${LOOP_WIRE_EMAIL}`,
        transport: "email_wire",
        mode: "push",
        priority: 1,
      },
    ],
  });
  console.log(`✓ Registered ${LOOP_PEER} → ${LOOP_WIRE_EMAIL}`);

  const eventId = randomUUID();
  const notice = proposeInterOrgNotice({
    peerId: LOOP_PEER,
    proposedBy: "phase4-mal-email-wire",
    contractId: "CTR-012",
    message: `Phase 4 email_wire live test ${eventId.slice(0, 8)}`,
    correlationEventId: eventId,
  });
  const approved = approveInterOrgNotice({
    noticeId: notice.notice_id,
    approverId: "段燕燕",
    eventId,
  });
  const envelope = approved.transmission.envelope;
  if (!envelope) throw new Error("approve did not produce envelope");

  console.log(`✓ Approved notice ${notice.notice_id} · event ${envelope.event_id}`);

  const deliver = await deliverProtocolEnvelope(envelope, LOOP_PEER);
  if (!deliver.delivered) {
    throw new Error(`deliver failed: ${deliver.reason}`);
  }
  console.log(`✓ Delivered via ${deliver.endpoint} · ${deliver.reason}`);

  const waitMs = Number(process.env.PHASE4_SMTP_WAIT_MS ?? "45000");
  const retries = Math.max(1, Number(process.env.PHASE4_INGEST_RETRIES ?? "3"));
  const retryMs = Number(process.env.PHASE4_INGEST_RETRY_MS ?? "25000");
  console.log(`  Waiting ${Math.round(waitMs / 1000)}s for SMTP delivery…`);
  await new Promise((r) => setTimeout(r, Number.isFinite(waitMs) ? waitMs : 45_000));

  let lastSync = { fetched: 0, saved: [] as string[] };
  let lastScan = {
    scanned: 0,
    ingested: 0,
    ingested_event_ids: [] as string[],
    skipped: 0,
    errors: [] as Array<{ file: string; reason: string }>,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    lastSync = await syncMailReceive();
    console.log(
      `✓ IMAP sync (attempt ${attempt}/${retries}): fetched ${lastSync.fetched} · saved ${lastSync.saved.length}`
    );

    lastScan = await scanMailReceivedForWire({ sinceDays: 1 });
    console.log(
      `✓ Wire scan (attempt ${attempt}/${retries}): ingested ${lastScan.ingested} · skipped ${lastScan.skipped}` +
        (lastScan.ingested_event_ids.length
          ? ` · events ${lastScan.ingested_event_ids.join(",")}`
          : "")
    );
    if (lastScan.errors.length) {
      for (const e of lastScan.errors) console.log(`  ✗ ${e.file}: ${e.reason}`);
    }

    if (getEmailWireEventConfirmation(envelope.event_id).state === "confirmed") break;
    if (attempt < retries) {
      console.log(`  ingest=0 — retry in ${Math.round(retryMs / 1000)}s…`);
      await new Promise((r) => setTimeout(r, Number.isFinite(retryMs) ? retryMs : 25_000));
    }
  }

  const confirm = getEmailWireEventConfirmation(envelope.event_id);
  const pending = listUnconfirmedEmailWireEvents();
  console.log(`  delivery confirm: ${confirm.state}`);
  if (pending.length) {
    console.log(`  unconfirmed email_wire events: ${pending.length}`);
  }

  if (confirm.state !== "confirmed") {
    const diagPath = writeDiag({
      tenant: TENANT,
      ok: false,
      event_id: envelope.event_id,
      notice_id: notice.notice_id,
      deliver: { endpoint: deliver.endpoint, reason: deliver.reason },
      sync: { fetched: lastSync.fetched, saved: lastSync.saved.length },
      scan: lastScan,
      confirmation: confirm.state,
      pending_unconfirmed: pending.length,
      redacted_env: {
        ORGOS_SMTP_USER: process.env.ORGOS_SMTP_USER,
        ORGOS_IMAP_USER: process.env.ORGOS_IMAP_USER,
        PHASE4_LOOP_WIRE_EMAIL: LOOP_WIRE_EMAIL,
      },
      note: redactSecrets("current event was not confirmed by inbound email_wire ingestion"),
    });
    throw new Error(
      `event ${envelope.event_id} was not confirmed after ${retries} attempt(s) — verify ai+wireloop delivery · diag: ${diagPath}`
    );
  }

  console.log("✓ Phase 4 email_wire roundtrip OK");
  const evidencePath = writeDiag({
    tenant: TENANT,
    ok: true,
    event_id: envelope.event_id,
    notice_id: notice.notice_id,
    confirmation: confirm.state,
    confirmed_at: confirm.confirmed_at,
    deliver: { endpoint: deliver.endpoint, reason: deliver.reason },
    sync: { fetched: lastSync.fetched, saved: lastSync.saved.length },
    scan: lastScan,
  });
  console.log(`✓ Evidence: ${evidencePath}`);
  if (process.env.PHASE4_CLEANUP_LOOPBACK === "1") {
    cleanupLoopbackPeer();
    cleanupLoopbackTransaction(envelope.event_id);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
