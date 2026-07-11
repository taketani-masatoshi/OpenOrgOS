/**
 * Phase 4 — mal email_wire live roundtrip
 * Outbound SMTP (ai@malkk.com) → ai+wireloop@malkk.com → IMAP sync → wire scan ingest
 */
import { randomUUID } from "node:crypto";
import { setTenantId } from "../src/lib/tenant.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { deriveOpenOrgDidFromPublicKey } from "../schemas/protocol/openorg-did.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { proposeInterOrgNotice, approveInterOrgNotice } from "../src/lib/wire/index.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import {
  getEmailWireEventConfirmation,
  listUnconfirmedEmailWireEvents,
} from "../src/lib/protocol/delivery-ledger.js";
import { syncMailReceive } from "../src/lib/correspondence/mail-receive-sync.js";
import { scanMailReceivedForWire } from "../src/lib/protocol/email-wire-ingest.js";
import { loadMailConfig } from "../src/lib/correspondence/mail-config.js";

const TENANT = process.env.ORGOS_TENANT ?? "mal";
const LOOP_PEER = "PEER-003";
const LOOP_WIRE_EMAIL = process.env.PHASE4_LOOP_WIRE_EMAIL ?? "ai+wireloop@malkk.com";

setTenantId(TENANT);

async function main(): Promise<void> {
  const mail = loadMailConfig();
  const wireFrom = mail?.wire_outbound?.from?.email ?? "ai@malkk.com";
  if (wireFrom.toLowerCase() === LOOP_WIRE_EMAIL.toLowerCase()) {
    throw new Error(
      `PHASE4_LOOP_WIRE_EMAIL must differ from wire_outbound.from (${wireFrom}) — E12 self-delivery`
    );
  }

  ensureProtocolSigningKey();
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

  console.log("  Waiting 45s for SMTP delivery…");
  await new Promise((r) => setTimeout(r, 45_000));

  const sync = await syncMailReceive();
  console.log(`✓ IMAP sync: fetched ${sync.fetched} · saved ${sync.saved.length}`);

  const scan = await scanMailReceivedForWire({ sinceDays: 1 });
  console.log(`✓ Wire scan: ingested ${scan.ingested} · skipped ${scan.skipped}`);
  if (scan.errors.length) {
    for (const e of scan.errors) console.log(`  ✗ ${e.file}: ${e.reason}`);
  }

  const confirm = getEmailWireEventConfirmation(envelope.event_id);
  const pending = listUnconfirmedEmailWireEvents();
  console.log(`  delivery confirm: ${confirm ? "yes" : "pending"}`);
  if (pending.length) {
    console.log(`  unconfirmed email_wire events: ${pending.length}`);
  }

  if (scan.ingested < 1) {
    throw new Error(
      "ingest count 0 — verify ai+wireloop@malkk.com delivery and ai@malkk.com IMAP sync"
    );
  }
  console.log("✓ Phase 4 email_wire roundtrip OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
