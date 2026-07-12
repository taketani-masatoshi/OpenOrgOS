import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import { ourOrgRef } from "./identity.js";
import { getTenantId } from "../tenant.js";
import { decodeGovGatewayInboundSync } from "../wire/gov-gateway/ingest.js";

export function buildCommitteeEnvelope(
  eventName: string,
  payload: Record<string, unknown>,
  destination?: { org_id: string; org_uri?: string }
): EventEnvelope {
  const now = new Date().toISOString();
  const origin = ourOrgRef();
  return {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin,
    destination,
    identity: { org_ref: origin },
    event: {
      type: `committee.webhook.${eventName}`,
      payload,
    },
    signature: null,
  };
}

export type WebhookBody =
  | { format: "legacy"; body: string }
  | { format: "envelope"; body: string }
  | { format: "dual"; body: string };

export function buildWebhookBodies(
  format: "legacy" | "envelope" | "dual",
  event: string,
  payload: Record<string, unknown>
): WebhookBody {
  const legacy = { event, payload, timestamp: new Date().toISOString() };
  const envelope = buildCommitteeEnvelope(event, payload);

  if (format === "legacy") {
    return { format: "legacy", body: JSON.stringify(legacy) };
  }
  if (format === "envelope") {
    return { format: "envelope", body: JSON.stringify(envelope) };
  }
  return {
    format: "dual",
    body: JSON.stringify({ legacy, envelope }),
  };
}

export function parseInboundWebhookBody(raw: unknown): {
  legacy?: { event: string; ref?: string; payload?: Record<string, unknown> };
  envelope?: EventEnvelope;
} {
  if (typeof raw !== "object" || raw === null) return {};

  const obj = raw as Record<string, unknown>;

  if (obj.format === "gov_gateway") {
    const decoded = decodeGovGatewayInboundSync(raw, getTenantId());
    if (decoded.ok && decoded.envelope) {
      return {
        envelope: decoded.envelope,
        legacy: {
          event: "gov_gateway_inbound",
          ref: decoded.envelope.event_id,
          payload: {
            profile_id: decoded.profile_id,
            native_message_id: decoded.native_message_id,
          },
        },
      };
    }
    return {};
  }

  if (obj.legacy && typeof obj.legacy === "object") {
    const legacy = obj.legacy as Record<string, unknown>;
    const envelopeParsed = obj.envelope ? eventEnvelopeSchema.safeParse(obj.envelope) : null;
    return {
      legacy: {
        event: String(legacy.event ?? ""),
        ref: legacy.ref ? String(legacy.ref) : undefined,
        payload: (legacy.payload as Record<string, unknown>) ?? undefined,
      },
      envelope: envelopeParsed?.success ? envelopeParsed.data : undefined,
    };
  }

  const envelopeTry = eventEnvelopeSchema.safeParse(raw);
  if (envelopeTry.success) {
    return { envelope: envelopeTry.data };
  }

  if (typeof obj.event === "string") {
    return {
      legacy: {
        event: obj.event,
        ref: obj.ref ? String(obj.ref) : undefined,
        payload: (obj.payload as Record<string, unknown>) ?? undefined,
      },
    };
  }

  return {};
}
