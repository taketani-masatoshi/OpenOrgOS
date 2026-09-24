import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import { parseEventEnvelope } from "./envelope.js";
import { getProtocolInboxDir, getProtocolOutboxDir } from "./paths.js";

/** Locate an envelope JSON in outbox or inbox by event_id (filename or scan). */
export function findEnvelopeFile(eventId: string): EventEnvelope | undefined {
  for (const dir of [getProtocolOutboxDir(), getProtocolInboxDir()]) {
    const direct = join(dir, `${eventId}.json`);
    if (existsSync(direct)) {
      return parseEventEnvelope(JSON.parse(readFileSync(direct, "utf-8")));
    }
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json") || file.endsWith(".steward-provenance.json")) continue;
        const env = parseEventEnvelope(JSON.parse(readFileSync(join(dir, file), "utf-8")));
        if (env.event_id === eventId) return env;
      }
    }
  }
  return undefined;
}

/** @deprecated Prefer findEnvelopeFile — name kept for witness call sites. */
export const findEnvelopeFileForWitness = findEnvelopeFile;
