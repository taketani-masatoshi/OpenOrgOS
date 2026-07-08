import { webhookRegistrySchema, type WebhookRegistry } from "../../schemas/webhook.js";
import { WEBHOOK_REGISTRY_PATH } from "./steward-paths.js";
import { loadRegistryFile } from "./utils.js";
import { pushQueueEvent } from "./queue-db.js";
import { buildWebhookBodies, parseInboundWebhookBody } from "./protocol/webhook-bridge.js";
import { recordProtocolTransaction } from "./protocol/record-transaction.js";
import { transactionTypeSchema } from "../../schemas/protocol/transaction-record.js";
import { findPeerByOrgRef, verifyInboundProtocolEnvelope } from "./protocol/inbound-verify.js";
import { operatorAttestationSchema } from "../../schemas/protocol/operator-attestation.js";
import { mirrorInboundEnvelope } from "./protocol/transport.js";
import { findTransactionByEventId } from "./protocol/transactions.js";
import type { EventEnvelope } from "../../schemas/protocol/org-event.js";

export { WEBHOOK_REGISTRY_PATH };

export function loadWebhookRegistry(): WebhookRegistry {
  return loadRegistryFile(WEBHOOK_REGISTRY_PATH, webhookRegistrySchema, () =>
    webhookRegistrySchema.parse({ version: "1" })
  );
}

export async function sendWebhook(
  event: string,
  payload: Record<string, unknown>
): Promise<{ sent: boolean; reason: string }> {
  const registry = loadWebhookRegistry();
  const outbound = registry.outbound;
  if (!outbound?.url) {
    return { sent: false, reason: "no outbound url configured" };
  }
  if (outbound.events.length && !outbound.events.includes(event)) {
    return { sent: false, reason: `event ${event} not in registry events` };
  }

  const format = outbound.format ?? "legacy";
  const { body } = buildWebhookBodies(format, event, payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.8",
    "X-Steward-Format": format,
  };
  if (outbound.secret) {
    headers["X-Steward-Secret"] = outbound.secret;
  }

  const res = await fetch(outbound.url, { method: "POST", headers, body });
  if (!res.ok) {
    return { sent: false, reason: `HTTP ${res.status}` };
  }
  return { sent: true, reason: "ok" };
}

export interface IngestWebhookPayload {
  event?: string;
  ref?: string;
  payload?: Record<string, unknown>;
  secret?: string;
  raw?: unknown;
}

function resolveInboundPeerId(envelope: EventEnvelope): string | undefined {
  const peer = findPeerByOrgRef(envelope.origin);
  if (peer) return peer.peer_id;

  const counterparty = envelope.event.payload.counterparty;
  if (typeof counterparty === "string" && counterparty.startsWith("PEER-")) {
    return counterparty;
  }
  return undefined;
}

export function ingestWebhook(data: IngestWebhookPayload): {
  ok: boolean;
  queueId?: string;
  transactionId?: string;
  inboxPath?: string;
  idempotent?: boolean;
  reason?: string;
  verificationIssues?: string[];
} {
  const registry = loadWebhookRegistry();
  if (registry.outbound?.secret && data.secret !== registry.outbound.secret) {
    return { ok: false, reason: "invalid secret" };
  }

  const parsed = data.raw ? parseInboundWebhookBody(data.raw) : {};
  const legacyEvent = parsed.legacy?.event ?? data.event ?? "unknown";
  const legacyRef = parsed.legacy?.ref ?? data.ref ?? legacyEvent;
  const legacyPayload = parsed.legacy?.payload ?? data.payload;

  const event = pushQueueEvent({
    type: "webhook_received",
    ref: legacyRef,
    payload: {
      event: legacyEvent,
      envelope_event_id: parsed.envelope?.event_id,
      ...(legacyPayload ?? {}),
    },
    status: "pending",
  });

  let transactionId: string | undefined;
  let inboxPath: string | undefined;
  let verificationIssues: string[] | undefined;

  if (parsed.envelope?.event.type === "org.transaction.recorded") {
    const strict = registry.inbound?.strict_verification ?? true;
    const verification = verifyInboundProtocolEnvelope(parsed.envelope);
    if (!verification.ok) {
      verificationIssues = verification.issues;
      if (strict) {
        return {
          ok: false,
          reason: verification.issues.join("; "),
          queueId: event.id,
          verificationIssues,
        };
      }
    }

    inboxPath = mirrorInboundEnvelope(parsed.envelope);

    const existing = findTransactionByEventId(parsed.envelope.event_id);
    if (existing) {
      return {
        ok: true,
        queueId: event.id,
        transactionId: existing.transaction_id,
        inboxPath,
        idempotent: true,
        verificationIssues,
      };
    }

    const p = parsed.envelope.event.payload;
    const txType = transactionTypeSchema.safeParse(p.transaction_type);
    const peerId = resolveInboundPeerId(parsed.envelope);
    if (txType.success && peerId) {
      try {
        const attestationParsed = operatorAttestationSchema.safeParse(p.operator_attestation);
        if (strict && p.direction === "outbound" && !attestationParsed.success) {
          return {
            ok: false,
            reason: "outbound wire envelope missing operator_attestation",
            queueId: event.id,
            verificationIssues,
          };
        }
        const notes = attestationParsed.success
          ? `inbound webhook · attested by ${attestationParsed.data.approver_id}`
          : "inbound webhook envelope";

        const result = recordProtocolTransaction({
          transactionType: txType.data,
          peerId,
          direction: "inbound",
          eventId: parsed.envelope.event_id,
          contractId:
            typeof p.refs === "object" && p.refs && "contract_id" in p.refs
              ? String((p.refs as Record<string, unknown>).contract_id)
              : undefined,
          invoiceId:
            typeof p.refs === "object" && p.refs && "invoice_id" in p.refs
              ? String((p.refs as Record<string, unknown>).invoice_id)
              : undefined,
          amount:
            typeof p.amount === "object" && p.amount && "value" in p.amount
              ? {
                  value: Number((p.amount as Record<string, unknown>).value),
                  currency: String((p.amount as Record<string, unknown>).currency ?? "JPY"),
                }
              : undefined,
          notes,
          writeOutbox: false,
        });
        transactionId = result.transaction.transaction_id;
        void import("./protocol/witness-hook.js").then(({ maybeRegisterWitnessAfterWire }) =>
          maybeRegisterWitnessAfterWire(parsed.envelope!, "received")
        );
      } catch (err) {
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
          queueId: event.id,
          verificationIssues,
          inboxPath,
        };
      }
    } else if (txType.success) {
      return {
        ok: false,
        reason: `peer not resolved for origin ${parsed.envelope.origin.org_id}`,
        queueId: event.id,
        verificationIssues,
        inboxPath,
      };
    }
  }

  return { ok: true, queueId: event.id, transactionId, inboxPath, verificationIssues };
}

export function formatWebhookConfig(): string {
  const registry = loadWebhookRegistry();
  const lines = [
    "# Webhook Registry",
    "",
    `**Version:** ${registry.version}`,
    `**Outbound URL:** ${registry.outbound?.url ?? "(not configured)"}`,
    `**Events:** ${registry.outbound?.events?.join(", ") ?? "—"}`,
    `**Outbound format:** ${registry.outbound?.format ?? "legacy"}`,
    `**Inbound enabled:** ${registry.inbound?.enabled ?? false}`,
    `**Strict verification:** ${registry.inbound?.strict_verification ?? true}`,
    "",
    "Configure: steward/platform/webhook/registry.yaml",
    "",
  ];
  return lines.join("\n");
}
