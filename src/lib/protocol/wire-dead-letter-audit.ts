import { appendJsonl } from "../jsonl-store.js";
import { join } from "node:path";
import { getProtocolDataDir } from "./paths.js";
import type { WirePendingEntry } from "../../../schemas/protocol/wire-pending.js";

export interface WireDeadLetterAuditEntry {
  recorded_at: string;
  peer_id: string;
  event_id: string;
  envelope_digest: string;
  attempts: number;
  last_error?: string;
  reason: "max_attempts_exceeded";
}

export function getWireDeadLetterAuditPath(): string {
  return join(getProtocolDataDir(), "wire-dead-letter-audit.jsonl");
}

export function appendWireDeadLetterAudit(entry: WirePendingEntry): void {
  const record: WireDeadLetterAuditEntry = {
    recorded_at: new Date().toISOString(),
    peer_id: entry.peer_id,
    event_id: entry.event_id,
    envelope_digest: entry.envelope_digest,
    attempts: entry.attempts ?? 0,
    last_error: entry.last_error,
    reason: "max_attempts_exceeded",
  };
  appendJsonl(getWireDeadLetterAuditPath(), record);
}
