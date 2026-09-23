/** Wire delivery, mesh, and mail-scan command handlers. */
import { applyProtocolTenant } from "./shared.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import {
  deliverProtocolEnvelopeWithRelay,
  flushWirePending,
  pullDeliverFromPeerOutbox,
} from "../../lib/protocol/transport/transport.js";
import { deliverEnvelopeViaMesh } from "../../lib/protocol/transport/peer-mesh.js";
import { join } from "node:path";
import {
  findPeer,
  resolvePeerOutboxBaseUrl,
} from "../../lib/protocol/transport/peers.js";
import { readFileSync } from "node:fs";


export interface ProtocolDeliverOptions {
  peer: string;
  file: string;
  tenant?: string;
}

export async function runProtocolDeliver(opts: ProtocolDeliverOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const envelope = JSON.parse(readFileSync(opts.file, "utf-8"));
  const parsed = eventEnvelopeSchema.parse(envelope);
  const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
  const delivery = await deliverProtocolEnvelopeWithRelay(parsed, opts.peer, withGovGatewayDeliver());
  if (!delivery.delivered && !delivery.queued) {
    console.error(`Deliver failed: ${delivery.reason}`);
    process.exit(1);
  }
  if (delivery.delivered) {
    console.log(`✓ delivered to ${opts.peer} · HTTP ${delivery.httpStatus}`);
  } else {
    console.log(`✓ queued for ${opts.peer} (${delivery.reason})`);
  }
}

export interface ProtocolDeliverFlushPendingOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolDeliverFlushPending(
  opts: ProtocolDeliverFlushPendingOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
  const flushed = await flushWirePending(withGovGatewayDeliver());
  if (opts.json) {
    console.log(JSON.stringify({ flushed }, null, 2));
    return;
  }
  console.log(`✓ flushed ${flushed} pending wire delivery(ies)`);
}

export interface ProtocolDeliverPullOptions {
  peer: string;
  eventId: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolDeliverPull(opts: ProtocolDeliverPullOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const peer = findPeer(opts.peer);
  if (!peer) {
    console.error(`Peer ${opts.peer} not found`);
    process.exit(1);
  }
  const outboxBase = resolvePeerOutboxBaseUrl(peer);
  if (!outboxBase) {
    console.error(`Peer ${opts.peer} has no outbox base URL (add pull endpoint or webhook URL)`);
    process.exit(1);
  }
  const result = await pullDeliverFromPeerOutbox(outboxBase, opts.eventId);
  if (!result.delivered) {
    console.error(`Pull failed: ${result.reason}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ pulled envelope ${opts.eventId} from ${opts.peer}`);
  if (result.inboxPath) {
    console.log(`  inbox: ${result.inboxPath}`);
  }
}

export interface ProtocolMeshDeliverOptions {
  peer: string;
  file: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolMeshDeliver(opts: ProtocolMeshDeliverOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const envelope = JSON.parse(readFileSync(opts.file, "utf-8"));
  const parsed = eventEnvelopeSchema.parse(envelope);
  const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
  const result = await deliverEnvelopeViaMesh(parsed, opts.peer, withGovGatewayDeliver());
  if (!result.delivered && !result.queued) {
    console.error(`Mesh deliver failed: ${result.reason}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ mesh delivered to ${opts.peer} via ${result.hops?.join(" → ") ?? opts.peer}`);
  if (result.queued) {
    console.log(`  queued: ${result.reason}`);
  }
}

export interface ProtocolDeliverStatusOptions {
  eventId: string;
  peerId?: string;
  json?: boolean;
}

export async function runProtocolDeliverStatus(opts: ProtocolDeliverStatusOptions): Promise<void> {
  const { listDeliveryAttempts, formatDeliveryAttemptsReport } = await import("../../lib/protocol/transport/delivery-ledger.js"
  );
  const attempts = listDeliveryAttempts({
    eventId: opts.eventId,
    peerId: opts.peerId,
  });
  if (opts.json) {
    console.log(JSON.stringify({ attempts }, null, 2));
    return;
  }
  console.log(formatDeliveryAttemptsReport(attempts, {
    eventId: opts.eventId,
    peerId: opts.peerId,
  }));
}

export interface ProtocolMailWireScanOptions {
  tenant?: string;
  sinceDays?: number;
  dryRun?: boolean;
  json?: boolean;
}

/** R5 Phase 2 — scan received mail for Wire MIME envelopes (protocol path). */
export async function runProtocolMailWireScan(opts: ProtocolMailWireScanOptions = {}): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { scanMailReceivedForWire } = await import("../../lib/protocol/adapters/email-wire-ingest.js");
  const result = await scanMailReceivedForWire({
    sinceDays: opts.sinceDays,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `Wire scan: scanned ${result.scanned} · ingested ${result.ingested} · skipped ${result.skipped}`
  );
  for (const err of result.errors) {
    console.log(`  ✗ ${err.file}: ${err.reason}`);
  }
}

export {
  runProtocolRelayOnce,
  runProtocolRelayRun,
  runProtocolRelayStatus,
  runProtocolSlaCheck,
} from "./relay.js";
export type {
  ProtocolRelayOnceOptions,
  ProtocolRelayRunOptions,
  ProtocolRelayStatusOptions,
  ProtocolSlaCheckOptions,
} from "./relay.js";
