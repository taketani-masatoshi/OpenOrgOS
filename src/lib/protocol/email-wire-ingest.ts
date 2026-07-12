import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import type { WireMessage } from "../../../schemas/protocol/wire-message.js";
import { wireMessageSchema } from "../../../schemas/protocol/wire-message.js";
import { wireMessageToEnvelope, assertWireHashMatchesEnvelope } from "../wire-gateway/codec.js";
import { ingestWebhook } from "../webhook.js";
import { getMailReceivedDir } from "../correspondence/paths.js";
import { recordDeliveryAttempt } from "./delivery-ledger.js";
import { loadRegistryFile, writeYamlFile, getDataDir } from "../utils.js";
import { z } from "zod";

export const WIRE_MIME_TYPE = "application/vnd.openorgos.wire+json";

const wirePartBufferSchema = z.object({
  version: z.literal(1).default(1),
  parts: z
    .array(
      z.object({
        event_id: z.string().uuid(),
        part_index: z.number().int().positive(),
        part_total: z.number().int().positive(),
        payload: z.string(),
        received_at: z.string(),
      })
    )
    .default([]),
});

type WirePartBuffer = z.output<typeof wirePartBufferSchema>;

function wirePartBufferPath(): string {
  return join(getDataDir(), "protocol", "email-wire-parts.yaml");
}

function loadWirePartBuffer(): WirePartBuffer {
  return loadRegistryFile(wirePartBufferPath(), wirePartBufferSchema, () =>
    wirePartBufferSchema.parse({ version: 1, parts: [] })
  );
}

function saveWirePartBuffer(buffer: WirePartBuffer): void {
  writeYamlFile(wirePartBufferPath(), wirePartBufferSchema.parse(buffer));
}

export interface ParsedWireEmail {
  eventId?: string;
  senderDid?: string;
  transport?: string;
  wire?: WireMessage;
  wirePart?: { index: number; total: number; payload: string };
  emlPath: string;
}

function parseWirePartHeader(value: string): { index: number; total: number } | undefined {
  const m = value.trim().match(/^(\d+)\/(\d+)$/);
  if (!m) return undefined;
  return { index: parseInt(m[1]!, 10), total: parseInt(m[2]!, 10) };
}

function storeWirePart(
  eventId: string,
  index: number,
  total: number,
  payload: string
): string | null {
  const buffer = loadWirePartBuffer();
  buffer.parts = buffer.parts.filter((p) => !(p.event_id === eventId && p.part_index === index));
  buffer.parts.push({
    event_id: eventId,
    part_index: index,
    part_total: total,
    payload,
    received_at: new Date().toISOString(),
  });
  saveWirePartBuffer(buffer);

  const collected = buffer.parts.filter((p) => p.event_id === eventId);
  const unique = new Set(collected.map((p) => p.part_index));
  if (unique.size < total) return null;

  const ordered = [...collected]
    .sort((a, b) => a.part_index - b.part_index)
    .map((p) => p.payload)
    .join("");
  buffer.parts = buffer.parts.filter((p) => p.event_id !== eventId);
  saveWirePartBuffer(buffer);
  return ordered;
}

function unfoldMimeBody(text: string): string {
  return text.replace(/\r?\n[ \t]+/g, "");
}

function decodeWireAttachmentPayload(raw: string): string | null {
  const unfolded = unfoldMimeBody(raw.trim());
  if (unfolded.startsWith("{")) return unfolded;
  try {
    const decoded = Buffer.from(unfolded.replace(/\s/g, ""), "base64").toString("utf-8");
    return decoded.startsWith("{") ? decoded : null;
  } catch {
    return null;
  }
}

function extractWirePayloadFromRaw(raw: string): string | null {
  const re =
    /Content-Type:\s*application\/vnd\.openorgos\.wire\+json[^\r\n]*(?:\r?\n[^\r\n]+)*\r?\n\r?\n([\s\S]*?)(?:\r?\n--|$)/i;
  const m = raw.match(re);
  if (!m?.[1]) return null;
  return decodeWireAttachmentPayload(m[1]);
}

export async function parseWireEml(emlPath: string): Promise<ParsedWireEmail | null> {
  const raw = readFileSync(emlPath, "utf-8");
  const parsed = await simpleParser(raw);
  const headers = parsed.headers;
  const eventId = String(headers.get("x-openorgos-event-id") ?? "");
  const senderDid = String(headers.get("x-openorgos-sender-did") ?? "");
  const transport = String(headers.get("x-openorgos-transport") ?? "");
  const partRaw = String(headers.get("x-openorgos-wire-part") ?? "");
  const partInfo = partRaw ? parseWirePartHeader(partRaw) : undefined;

  const isWire =
    transport === "email_wire" ||
    parsed.attachments.some(
      (a) => a.contentType?.includes(WIRE_MIME_TYPE) || a.filename === "wire-message.json"
    ) ||
    raw.includes(WIRE_MIME_TYPE);

  if (!isWire) return null;

  const attachment = parsed.attachments.find(
    (a) => a.contentType?.includes(WIRE_MIME_TYPE) || a.filename === "wire-message.json"
  );
  let payload = attachment?.content?.toString("utf-8") ?? extractWirePayloadFromRaw(raw) ?? "";
  if (payload) {
    payload = unfoldMimeBody(payload);
  }

  if (!payload) return null;

  if (partInfo && eventId) {
    return {
      eventId,
      senderDid: senderDid || undefined,
      transport: transport || "email_wire",
      wirePart: { index: partInfo.index, total: partInfo.total, payload },
      emlPath,
    };
  }

  try {
    const json = JSON.parse(payload) as Record<string, unknown>;
    const validated = wireMessageSchema.safeParse(json);
    const wire = validated.success ? validated.data : (json as WireMessage);
    if (!wire?.eventId || typeof wire.eventId !== "string") return null;
    return {
      eventId: eventId || wire.eventId,
      senderDid: senderDid || undefined,
      transport: transport || "email_wire",
      wire,
      emlPath,
    };
  } catch {
    return null;
  }
}

export function ingestWireFromEmail(
  parsed: ParsedWireEmail | null
): ReturnType<typeof ingestWebhook> {
  if (!parsed) {
    return { ok: false, reason: "not a wire email" };
  }
  let wire = parsed.wire;
  if (!wire && parsed.wirePart && parsed.eventId) {
    const assembled = storeWirePart(
      parsed.eventId,
      parsed.wirePart.index,
      parsed.wirePart.total,
      parsed.wirePart.payload
    );
    if (!assembled) {
      return { ok: false, reason: "wire part buffered — awaiting remaining parts" };
    }
    try {
      wire = wireMessageSchema.parse(JSON.parse(assembled));
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "wire part reassembly failed" };
    }
  }

  if (!wire) {
    return { ok: false, reason: "wire attachment missing" };
  }
  try {
    assertWireHashMatchesEnvelope(wire);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const envelope = wireMessageToEnvelope(wire);
  const result = ingestWebhook({ raw: envelope });
  if (result.ok) {
    recordDeliveryAttempt({
      event_id: wire.eventId,
      peer_id: envelope.origin?.org_id ?? "unknown",
      channel: "email_wire",
      status: "success",
      direction: "inbound",
      endpoint: parsed.emlPath,
    });
  }
  return result;
}

export interface WireScanResult {
  scanned: number;
  ingested: number;
  ingested_event_ids: string[];
  skipped: number;
  errors: Array<{ file: string; reason: string }>;
}

export async function scanMailReceivedForWire(opts?: {
  sinceDays?: number;
  dryRun?: boolean;
}): Promise<WireScanResult> {
  const dir = getMailReceivedDir();
  if (!existsSync(dir)) {
    return { scanned: 0, ingested: 0, ingested_event_ids: [], skipped: 0, errors: [] };
  }

  const cutoff = opts?.sinceDays != null ? Date.now() - opts.sinceDays * 86_400_000 : undefined;

  const result: WireScanResult = {
    scanned: 0,
    ingested: 0,
    ingested_event_ids: [],
    skipped: 0,
    errors: [],
  };

  for (const file of readdirSync(dir).filter((n) => n.endsWith(".eml"))) {
    const emlPath = join(dir, file);
    if (cutoff != null) {
      const stat = await import("node:fs/promises").then((fs) => fs.stat(emlPath));
      if (stat.mtimeMs < cutoff) continue;
    }

    result.scanned++;
    const parsed = await parseWireEml(emlPath);
    if (!parsed) {
      result.skipped++;
      continue;
    }

    if (opts?.dryRun) {
      result.ingested++;
      const eid = parsed.eventId ?? parsed.wire?.eventId;
      if (eid) result.ingested_event_ids.push(eid);
      continue;
    }

    const ingest = ingestWireFromEmail(parsed);
    if (ingest.ok) {
      result.ingested++;
      const eid = parsed.eventId ?? parsed.wire?.eventId;
      if (eid) result.ingested_event_ids.push(eid);
    } else if (ingest.idempotent) {
      result.skipped++;
    } else if (ingest.reason?.includes("awaiting remaining parts")) {
      result.skipped++;
    } else {
      result.errors.push({ file, reason: ingest.reason ?? "ingest failed" });
    }
  }

  return result;
}
