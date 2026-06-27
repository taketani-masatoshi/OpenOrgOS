import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import { getProtocolInboxDir, getProtocolOutboxDir } from "./paths.js";
import { envelopeDigest } from "./canonical.js";

export interface InboxExportEntry {
  event_id: string;
  envelope_digest: string;
  recorded_at: string;
  envelope: EventEnvelope;
}

function readEnvelopesFromDir(dir: string): InboxExportEntry[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  const entries: InboxExportEntry[] = [];
  for (const file of files) {
    const path = join(dir, file);
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      const envelope = eventEnvelopeSchema.parse(raw);
      const st = statSync(path);
      entries.push({
        event_id: envelope.event_id,
        envelope_digest: envelopeDigest(envelope),
        recorded_at: st.mtime.toISOString(),
        envelope,
      });
    } catch {
      /* skip invalid */
    }
  }
  return entries.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

export function exportInboxEntries(opts?: {
  since?: string;
  limit?: number;
}): InboxExportEntry[] {
  const all = readEnvelopesFromDir(getProtocolInboxDir());
  let filtered = all;
  if (opts?.since) {
    filtered = all.filter((e) => e.recorded_at >= opts.since!);
  }
  if (opts?.limit && opts.limit > 0) {
    filtered = filtered.slice(0, opts.limit);
  }
  return filtered;
}

export function exportOutboxEntries(opts?: {
  since?: string;
  limit?: number;
}): InboxExportEntry[] {
  const all = readEnvelopesFromDir(getProtocolOutboxDir());
  let filtered = all;
  if (opts?.since) {
    filtered = all.filter((e) => e.recorded_at >= opts.since!);
  }
  if (opts?.limit && opts.limit > 0) {
    filtered = filtered.slice(0, opts.limit);
  }
  return filtered;
}
