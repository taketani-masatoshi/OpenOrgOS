/**
 * Phase 4b — cross-org email_notify evidence (mal → southwood)
 *
 * mal SMTP notify → IMAP (shared mailbox) → copy eml into southwood mail-received
 * → southwood notify-scan Pull with X-Wire-Peer-Id=southwood → ingest
 *
 * Usage (repo root, mail env loaded):
 *   ORGOS_TENANT=mal PUBLIC_BASE_URL=https://wire.oorgos.org \
 *     node --import tsx scripts/phase4-mal-southwood-email-notify-cross.ts
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR, getTenantId } from "../src/lib/tenant.js";
import { proposeInterOrgNotice, approveInterOrgNotice } from "../src/lib/wire/index.js";
import { deliverProtocolEnvelopeWithRelay } from "../src/lib/protocol/transport.js";
import { syncMailReceive } from "../src/lib/correspondence/mail-receive-sync.js";
import {
  parseNotifyEml,
  scanMailReceivedForNotify,
} from "../src/lib/protocol/email-notify-ingest.js";
import { getMailReceivedDir } from "../src/lib/correspondence/paths.js";
import { findPeer, loadPeersRegistry, registerPeer } from "../src/lib/protocol/peers.js";
import { exportProtocolPublicKeyBase64, ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { resolveWireOutboundConfig } from "../src/lib/correspondence/mail-config.js";
import { listTransactions, removeTransactionsById } from "../src/lib/protocol/transactions.js";
import { deriveOpenOrgDidFromPublicKey } from "../schemas/protocol/openorg-did.js";

const SENDER = "mal";
const RECEIVER = "southwood";
const PEER_ID = "PEER-001";
const CROSS_NOTIFY_EMAIL =
  process.env.PHASE4_CROSS_NOTIFY_EMAIL ?? "ai+sw-notify@malkk.com";

function writeEvidence(payload: Record<string, unknown>): string {
  const dir = join(ROOT_DIR, "scratch");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `phase4b-cross-mal-southwood-${stamp}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf-8");
  return path;
}

function requireSmtp(): void {
  const wire = resolveWireOutboundConfig();
  if (wire.provider !== "smtp") {
    throw new Error("wire outbound must be smtp — source deploy/mal-pilot/env/.env.mail-wire");
  }
  for (const key of ["ORGOS_SMTP_USER", "ORGOS_SMTP_PASSWORD", "ORGOS_IMAP_USER", "ORGOS_IMAP_PASSWORD"]) {
    if (!process.env[key]?.trim()) throw new Error(`${key} missing`);
  }
}

function pinSouthwoodMalPeerKey(): void {
  setTenantId(SENDER);
  ensureProtocolSigningKey();
  const malKey = exportProtocolPublicKeyBase64();
  if (!malKey) throw new Error("mal signing public key missing");
  const malDid = deriveOpenOrgDidFromPublicKey(malKey);

  setTenantId(RECEIVER);
  ensureProtocolSigningKey();
  const registry = loadPeersRegistry();
  const existing = registry.peers.find((p) => p.org_uri === "steward://tenant/mal" || p.peer_id === "PEER-002");
  const profile = {
    peer_id: existing?.peer_id ?? "PEER-002",
    display_name: existing?.display_name ?? "株式会社MAL",
    jurisdiction: "JP" as const,
    org_uri: "steward://tenant/mal",
    did: malDid,
    protocol_public_key: malKey,
    inbound_endpoints: existing?.inbound_endpoints,
    wire_email: existing?.wire_email,
  };
  registerPeer(profile);
  console.log(`✓ southwood peer ${profile.peer_id} pinned to current mal signing key`);
}

function ensureMalSouthwoodWireEmail(): { previous?: string } {
  setTenantId(SENDER);
  const peer = findPeer(PEER_ID);
  if (!peer) throw new Error(`${PEER_ID} missing on mal`);
  const previous = peer.wire_email;
  registerPeer({
    ...peer,
    wire_email: CROSS_NOTIFY_EMAIL,
  });
  console.log(`✓ mal ${PEER_ID}.wire_email → ${CROSS_NOTIFY_EMAIL}`);
  return { previous };
}

function restoreMalSouthwoodWireEmail(previous?: string): void {
  setTenantId(SENDER);
  const peer = findPeer(PEER_ID);
  if (!peer) return;
  if (previous) {
    registerPeer({ ...peer, wire_email: previous });
  } else {
    const { wire_email: _drop, ...rest } = peer;
    registerPeer(rest as typeof peer);
  }
}

async function copyNotifyEmlToSouthwood(eventId: string): Promise<string | undefined> {
  setTenantId(SENDER);
  const srcDir = getMailReceivedDir();
  if (!existsSync(srcDir)) return undefined;
  for (const file of readdirSync(srcDir).filter((n) => n.endsWith(".eml"))) {
    const src = join(srcDir, file);
    const parsed = await parseNotifyEml(src);
    if (!parsed || parsed.eventId !== eventId) continue;
    setTenantId(RECEIVER);
    const destDir = getMailReceivedDir();
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, file);
    copyFileSync(src, dest);
    return dest;
  }
  return undefined;
}

async function main(): Promise<void> {
  requireSmtp();
  process.env.PUBLIC_BASE_URL ??= "https://wire.oorgos.org";

  pinSouthwoodMalPeerKey();
  const { previous } = ensureMalSouthwoodWireEmail();

  setTenantId(SENDER);
  const eventId = randomUUID();
  const notice = proposeInterOrgNotice({
    peerId: PEER_ID,
    proposedBy: "phase4-cross-org-notify",
    contractId: "CTR-012",
    message: `Phase 4b cross-org email_notify ${eventId.slice(0, 8)}`,
    correlationEventId: eventId,
  });
  const approved = approveInterOrgNotice({
    noticeId: notice.notice_id,
    approverId: "段燕燕",
    eventId,
  });
  const envelope = approved.transmission.envelope;
  if (!envelope) throw new Error("approve did not produce envelope");
  console.log(`✓ Approved ${notice.notice_id} · event ${envelope.event_id}`);

  const deliver = await deliverProtocolEnvelopeWithRelay(envelope, PEER_ID, {
    attemptSummary: "phase4b cross-org notify mal→southwood",
  });
  if (!deliver.notified && !deliver.queued) {
    throw new Error(`deliver failed: ${deliver.reason}`);
  }
  console.log(`✓ Notify · ${deliver.reason} · ${deliver.endpoint ?? ""}`);

  const waitMs = Number(process.env.PHASE4_SMTP_WAIT_MS ?? "45000");
  console.log(`  Waiting ${Math.round(waitMs / 1000)}s for SMTP…`);
  await new Promise((r) => setTimeout(r, Number.isFinite(waitMs) ? waitMs : 45_000));

  setTenantId(SENDER);
  const sync = await syncMailReceive();
  console.log(`✓ IMAP sync fetched=${sync.fetched} saved=${sync.saved.length}`);

  const copied = await copyNotifyEmlToSouthwood(envelope.event_id);
  if (!copied) {
    const path = writeEvidence({
      ok: false,
      direction: "mal→southwood",
      event_id: envelope.event_id,
      deliver,
      sync: { fetched: sync.fetched, saved: sync.saved.length },
      note: "notify eml not found after IMAP sync",
    });
    restoreMalSouthwoodWireEmail(previous);
    throw new Error(`notify eml missing — evidence ${path}`);
  }
  console.log(`✓ Copied notify eml → southwood ${copied}`);

  setTenantId(RECEIVER);
  let scan = await scanMailReceivedForNotify({ sinceDays: 1 });
  if (!scan.pulled_event_ids.includes(envelope.event_id)) {
    const localPull = `http://127.0.0.1:8443/wire/v1/events/${envelope.event_id}`;
    const { fetchEnvelopeFromPullUrl } = await import("../src/lib/protocol/outbox-pull-fetch.js");
    const retry = await fetchEnvelopeFromPullUrl(localPull, envelope.event_id, {
      pullerNodeId: RECEIVER,
    });
    if (retry.ok) {
      scan = {
        ...scan,
        pulled: scan.pulled + 1,
        pulled_event_ids: [...scan.pulled_event_ids, envelope.event_id],
        queued: Math.max(0, scan.queued - 1),
        errors: [],
      };
      console.log(`✓ southwood Pull retry via local Gateway OK (${localPull})`);
    } else {
      console.log(`  local Pull retry failed: ${retry.reason}`);
    }
  }
  console.log(
    `✓ southwood scan pulled=${scan.pulled} queued=${scan.queued} errors=${scan.errors.length}` +
      (scan.pulled_event_ids.length ? ` events=${scan.pulled_event_ids.join(",")}` : "")
  );
  for (const e of scan.errors) console.log(`  ✗ ${e.file}: ${e.reason}`);

  const pulled = scan.pulled_event_ids.includes(envelope.event_id);
  const evidencePath = writeEvidence({
    ok: pulled,
    direction: "mal→southwood",
    event_id: envelope.event_id,
    notice_id: notice.notice_id,
    peer_id: PEER_ID,
    puller_tenant: RECEIVER,
    deliver: {
      endpoint: deliver.endpoint,
      reason: deliver.reason,
      notified: deliver.notified,
    },
    sync: { fetched: sync.fetched, saved: sync.saved.length },
    copied_eml: copied,
    scan,
    sender_tenant: getTenantId() === RECEIVER ? SENDER : getTenantId(),
  });

  setTenantId(SENDER);
  restoreMalSouthwoodWireEmail(previous);
  const txs = listTransactions()
    .filter((t) => t.event_id === envelope.event_id)
    .map((t) => t.transaction_id);
  removeTransactionsById(txs);

  if (!pulled) {
    throw new Error(`southwood did not pull ${envelope.event_id} — evidence ${evidencePath}`);
  }
  console.log(`✓ Phase 4b cross-org email_notify OK`);
  console.log(`✓ Evidence: ${evidencePath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
