import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProtocolInboxDir } from "../paths.js";
import type { DeliverEnvelopeResult } from "./types.js";

export function mirrorInboundEnvelope(envelope: EventEnvelope): string {
  const dir = getProtocolInboxDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${envelope.event_id}.json`);
  writeFileSync(path, JSON.stringify(envelope, null, 2), "utf-8");
  return path;
}

export async function pullDeliverFromPeerOutbox(
  peerOutboxUrl: string,
  eventId: string
): Promise<DeliverEnvelopeResult & { inboxPath?: string }> {
  const base = peerOutboxUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/protocol/v1/outbox/${eventId}`);
  if (!res.ok) {
    return { delivered: false, reason: `pull failed: HTTP ${res.status}` };
  }
  const body = (await res.json()) as { ok?: boolean; envelope?: EventEnvelope };
  if (!body.envelope) {
    return { delivered: false, reason: "pull: envelope missing" };
  }
  const inboxPath = mirrorInboundEnvelope(body.envelope);
  return { delivered: true, reason: "pull-ok", inboxPath };
}
