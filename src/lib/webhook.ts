import { webhookRegistrySchema, type WebhookRegistry } from "../../schemas/webhook.js";
import { WEBHOOK_REGISTRY_PATH } from "./steward-paths.js";
import { loadRegistryFile } from "./utils.js";
import { pushQueueEvent } from "./queue-db.js";

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

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Steward-OS/0.7",
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
  event: string;
  ref?: string;
  payload?: Record<string, unknown>;
  secret?: string;
}

export function ingestWebhook(data: IngestWebhookPayload): { ok: boolean; queueId?: string; reason?: string } {
  const registry = loadWebhookRegistry();
  if (registry.outbound?.secret && data.secret !== registry.outbound.secret) {
    return { ok: false, reason: "invalid secret" };
  }

  const event = pushQueueEvent({
    type: "webhook_received",
    ref: data.ref ?? data.event,
    payload: { event: data.event, ...data.payload },
    status: "pending",
  });

  return { ok: true, queueId: event.id };
}

export function formatWebhookConfig(): string {
  const registry = loadWebhookRegistry();
  const lines = [
    "# Webhook Registry",
    "",
    `**Version:** ${registry.version}`,
    `**Outbound URL:** ${registry.outbound?.url ?? "(not configured)"}`,
    `**Events:** ${registry.outbound?.events?.join(", ") ?? "—"}`,
    `**Inbound enabled:** ${registry.inbound?.enabled ?? false}`,
    "",
    "Configure: steward/platform/webhook/registry.yaml",
    "",
  ];
  return lines.join("\n");
}
