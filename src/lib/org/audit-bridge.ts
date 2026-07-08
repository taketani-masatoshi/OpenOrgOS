import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEvent } from "../../../schemas/audit-log.js";
import {
  orgAuditBridgeConfigSchema,
  orgAuditBridgeRecommendedConfig,
} from "../../../schemas/org/audit-bridge.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { appendProtocolAuditRecord } from "../protocol/audit-chain.js";
import { ourOrgRef } from "../protocol/identity.js";
import { validateEnvelopeAgainstRegistry } from "../protocol/registry.js";
import { maybeSignEnvelope } from "../protocol/signing.js";
import { isAuditEventBridged, markAuditEventBridged } from "./audit-bridge-state.js";
import { getOrgAuditBridgeConfigPath } from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export function loadOrgAuditBridgeConfig() {
  const path = getOrgAuditBridgeConfigPath();
  if (!existsSync(path)) {
    return orgAuditBridgeConfigSchema.parse(orgAuditBridgeRecommendedConfig);
  }
  return readYamlFile(path, orgAuditBridgeConfigSchema);
}

/** Write recommended config when missing — enables operational → protocol audit mirror. */
export function ensureOrgAuditBridgeConfig(): void {
  const path = getOrgAuditBridgeConfigPath();
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, orgAuditBridgeRecommendedConfig);
}

export function shouldBridgeAuditEvent(event: AuditEvent): boolean {
  const config = loadOrgAuditBridgeConfig();
  if (!config.enabled) return false;
  if (config.events.length === 0) return true;
  return config.events.includes(event.event);
}

export function bridgeAuditEventToProtocolChain(event: AuditEvent): EventEnvelope | null {
  if (!shouldBridgeAuditEvent(event)) return null;
  if (isAuditEventBridged(event.id)) return null;

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
  markAuditEventBridged(event.id);
  return envelope;
}
