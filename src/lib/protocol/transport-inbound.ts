import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { serializeEventEnvelope } from "./envelope.js";
import { getProtocolInboxDir } from "./paths.js";

export function mirrorInboundEnvelope(envelope: EventEnvelope): string {
  const dir = getProtocolInboxDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${envelope.event_id}.json`);
  writeFileSync(path, serializeEventEnvelope(envelope), "utf-8");
  return path;
}
