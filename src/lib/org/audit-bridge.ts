import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { AuditEvent } from "../../../schemas/audit-log.js";
import { orgAuditBridgeConfigSchema } from "../../../schemas/org/audit-bridge.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { appendProtocolAuditRecord } from "../protocol/audit-chain.js";
import { ourOrgRef } from "../protocol/identity.js";
import { validateEnvelopeAgainstRegistry } from "../protocol/registry.js";
import { maybeSignEnvelope } from "../protocol/signing.js";
import { getOrgAuditBridgeConfigPath } from "./paths.js";
import { readYamlFile } from "../utils.js";

export function loadOrgAuditBridgeConfig() {
  const path = getOrgAuditBridgeConfigPath();
  if (!existsSync(path)) {
    return orgAuditBridgeConfigSchema.parse({ enabled: false, events: [] });
  }
  return readYamlFile(path, orgAuditBridgeConfigSchema);
}

export function shouldBridgeAuditEvent(event: AuditEvent): boolean {
  const config = loadOrgAuditBridgeConfig();
  if (!config.enabled) return false;
  if (config.events.length === 0) return true;
  return config.events.includes(event.event);
}

export function bridgeAuditEventToProtocolChain(event: AuditEvent): EventEnvelope | null {
  if (!shouldBridgeAuditEvent(event)) return null;

  const now = new Date().toISOString();
  let envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: ourOrgRef(),
    correlation_id: event.event_id ?? event.id,
    identity: { org_ref: ourOrgRef() },
    event: {
      type: "org.audit.attested",
      payload: {
        scope: "internal",
        kind: "operational.recorded",
        approval_id: event.id,
        subject_type: `operational.${event.event}`,
        subject_ref: event.ref,
        operational: {
          audit_id: event.id,
          audit_event: event.event,
          actor: event.actor,
          detail: event.detail,
          timestamp: event.timestamp,
          event_id: event.event_id,
          transaction_id: event.transaction_id,
        },
      },
    },
    signature: null,
  };

  const issue = validateEnvelopeAgainstRegistry(envelope.event.type);
  if (issue) {
    throw new Error(issue);
  }

  envelope = maybeSignEnvelope(envelope);
  appendProtocolAuditRecord({
    envelope,
    transactionId: event.transaction_id,
  });
  return envelope;
}
