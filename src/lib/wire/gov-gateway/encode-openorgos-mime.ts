import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../../schemas/protocol/org-event.js";
import { canonicalJson } from "../../protocol/canonical.js";
import { OPENORGOS_ENVELOPE_MIME } from "./types.js";

export { OPENORGOS_ENVELOPE_MIME };

export function encodeOpenOrgOsMime(envelope: EventEnvelope): string {
  return canonicalJson(envelope);
}

export function decodeOpenOrgOsMime(body: string | Uint8Array): EventEnvelope {
  const text = typeof body === "string" ? body : new TextDecoder().decode(body);
  const parsed = JSON.parse(text) as unknown;
  return eventEnvelopeSchema.parse(parsed);
}

export function bodyToString(body: string | Uint8Array): string {
  return typeof body === "string" ? body : new TextDecoder().decode(body);
}
