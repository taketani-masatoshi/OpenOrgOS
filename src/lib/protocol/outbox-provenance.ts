import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { outboxProvenanceSchema, type OutboxProvenance } from "../../../schemas/protocol/outbox-provenance.js";
import { envelopeDigest } from "./canonical.js";
import { isProtocolWriteGuardDisabled } from "./protocol-write-guard.js";

export function outboxProvenancePath(outboxDir: string, eventId: string): string {
  return join(outboxDir, `${eventId}.steward-provenance.json`);
}

export function writeOutboxProvenance(
  outboxDir: string,
  envelope: EventEnvelope,
  source: string
): void {
  const record: OutboxProvenance = {
    event_id: envelope.event_id,
    source,
    written_at: new Date().toISOString(),
    digest: envelopeDigest(envelope),
  };
  writeFileSync(outboxProvenancePath(outboxDir, envelope.event_id), JSON.stringify(record, null, 2), "utf-8");
}

export function loadOutboxProvenance(outboxDir: string, eventId: string): OutboxProvenance | undefined {
  const path = outboxProvenancePath(outboxDir, eventId);
  if (!existsSync(path)) return undefined;
  return outboxProvenanceSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function verifyOutboxProvenance(
  outboxDir: string,
  envelope: EventEnvelope
): { ok: boolean; reason?: string } {
  if (isProtocolWriteGuardDisabled()) {
    return { ok: true };
  }
  const provenance = loadOutboxProvenance(outboxDir, envelope.event_id);
  if (!provenance) {
    return {
      ok: false,
      reason: `missing steward-provenance for outbox event ${envelope.event_id} (direct write?)`,
    };
  }
  const digest = envelopeDigest(envelope);
  if (provenance.digest !== digest) {
    return {
      ok: false,
      reason: `outbox provenance digest mismatch for ${envelope.event_id}`,
    };
  }
  return { ok: true };
}

export function listOutboxEventIdsWithoutProvenance(outboxDir: string): string[] {
  if (!existsSync(outboxDir)) return [];
  const missing: string[] = [];
  for (const file of readdirSync(outboxDir)) {
    if (!/^[0-9a-f-]{36}\.json$/i.test(file)) continue;
    const eventId = file.replace(/\.json$/, "");
    if (!existsSync(outboxProvenancePath(outboxDir, eventId))) {
      missing.push(eventId);
    }
  }
  return missing;
}
