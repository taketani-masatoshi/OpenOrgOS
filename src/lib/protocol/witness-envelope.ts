import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { parseEventEnvelope } from "./envelope.js";
import { getProtocolInboxDir, getProtocolOutboxDir } from "./paths.js";

export function findEnvelopeFileForWitness(eventId: string): EventEnvelope | undefined {
  for (const dir of [getProtocolOutboxDir(), getProtocolInboxDir()]) {
    const direct = join(dir, `${eventId}.json`);
    if (existsSync(direct)) {
      return parseEventEnvelope(JSON.parse(readFileSync(direct, "utf-8")));
    }
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const env = parseEventEnvelope(JSON.parse(readFileSync(join(dir, file), "utf-8")));
        if (env.event_id === eventId) return env;
      }
    }
  }
  return undefined;
}
