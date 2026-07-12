import {
  eventEnvelopeSchema,
  type EventEnvelope,
  type OrgEvent,
} from "../../../schemas/protocol/org-event.js";

export function parseEventEnvelope(raw: unknown): EventEnvelope {
  return eventEnvelopeSchema.parse(raw);
}

export function serializeEventEnvelope(envelope: EventEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

export function validateEventEnvelope(
  raw: unknown
): { ok: true; envelope: EventEnvelope } | { ok: false; error: string } {
  const parsed = eventEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, envelope: parsed.data };
}

export function roundTripEnvelope(envelope: EventEnvelope): EventEnvelope {
  return parseEventEnvelope(JSON.parse(JSON.stringify(envelope)));
}

export type { OrgEvent, EventEnvelope };
