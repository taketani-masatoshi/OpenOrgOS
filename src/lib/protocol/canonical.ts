import { createHash } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function envelopeDigest(envelope: EventEnvelope): string {
  const { signature: _sig, ...unsigned } = envelope;
  return createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
}
