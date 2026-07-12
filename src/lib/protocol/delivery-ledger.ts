import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  deliveryAttemptSchema,
  deliveryAttemptsRegistrySchema,
  type DeliveryAttempt,
  type DeliveryChannel,
  type DeliveryAttemptStatus,
} from "../../../schemas/protocol/delivery-attempt.js";
import { getDeliveryAttemptsJsonlPath, getDeliveryAttemptsPath } from "./paths.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { getWireSentDir } from "../correspondence/paths.js";
import { getDocsDir, readYamlFile, writeYamlFile, currentDate } from "../utils.js";
import { getClock } from "../runtime-context.js";

/**
 * Storage port for delivery attempts (Repository pilot · engineering §3).
 * Default: append-only jsonl under the tenant protocol dir.
 */
export interface DeliveryAttemptRepository {
  loadAll(): DeliveryAttempt[];
  append(attempt: DeliveryAttempt): void;
}

function createJsonlDeliveryAttemptRepository(): DeliveryAttemptRepository {
  return {
    loadAll() {
      const jsonlPath = getDeliveryAttemptsJsonlPath();
      if (existsSync(jsonlPath)) {
        return loadJsonl(jsonlPath, (raw) => deliveryAttemptSchema.parse(raw));
      }
      const yamlPath = getDeliveryAttemptsPath();
      if (!existsSync(yamlPath)) return [];
      const legacy = readYamlFile(yamlPath, deliveryAttemptsRegistrySchema);
      for (const attempt of legacy.attempts) {
        appendJsonl(jsonlPath, attempt);
      }
      return legacy.attempts;
    },
    append(attempt) {
      const jsonlPath = getDeliveryAttemptsJsonlPath();
      if (!existsSync(jsonlPath)) {
        // Bootstrap legacy YAML before first append so history is preserved.
        this.loadAll();
      }
      appendJsonl(jsonlPath, attempt);
    },
  };
}

let repository: DeliveryAttemptRepository = createJsonlDeliveryAttemptRepository();

/** Test / DI hook — swap storage without changing domain callers. */
export function setDeliveryAttemptRepository(next: DeliveryAttemptRepository): void {
  repository = next;
}

export function resetDeliveryAttemptRepository(): void {
  repository = createJsonlDeliveryAttemptRepository();
}

export function loadDeliveryAttemptsRegistry() {
  const attempts = repository.loadAll();
  return deliveryAttemptsRegistrySchema.parse({
    as_of: currentDate(),
    attempts,
  });
}

export function recordDeliveryAttempt(
  entry: Omit<DeliveryAttempt, "at"> & { at?: string }
): DeliveryAttempt {
  const record: DeliveryAttempt = {
    ...entry,
    at: entry.at ?? getClock().nowIso(),
  };
  repository.append(record);
  // Derived YAML snapshot (best-effort · not SSOT)
  try {
    const registry = loadDeliveryAttemptsRegistry();
    writeYamlFile(getDeliveryAttemptsPath(), {
      ...registry,
      as_of: currentDate(),
    });
  } catch {
    /* snapshot failure must not block append-only write */
  }
  return record;
}

export function listDeliveryAttempts(filter?: {
  eventId?: string;
  peerId?: string;
  channel?: DeliveryChannel;
}): DeliveryAttempt[] {
  const registry = loadDeliveryAttemptsRegistry();
  return registry.attempts.filter((a) => {
    if (filter?.eventId && a.event_id !== filter.eventId) return false;
    if (filter?.peerId && a.peer_id !== filter.peerId) return false;
    if (filter?.channel && a.channel !== filter.channel) return false;
    return true;
  });
}

export function hasSuccessfulEmailWireFallback(withinDays = 90): boolean {
  const cutoff = getClock().nowMs() - withinDays * 86_400_000;
  return loadDeliveryAttemptsRegistry().attempts.some(
    (a) =>
      a.channel === "email_wire" &&
      a.status === "success" &&
      (a.direction === undefined || a.direction === "outbound") &&
      new Date(a.at).getTime() >= cutoff
  );
}

export function hasSuccessfulEmailWireIngest(withinDays = 90): boolean {
  const cutoff = getClock().nowMs() - withinDays * 86_400_000;
  return loadDeliveryAttemptsRegistry().attempts.some(
    (a) =>
      a.channel === "email_wire" &&
      a.status === "success" &&
      a.direction === "inbound" &&
      new Date(a.at).getTime() >= cutoff
  );
}

export type EmailWireEventConfirmationState =
  "not_sent" | "awaiting_inbound_confirmation" | "confirmed";

export interface EmailWireEventConfirmation {
  event_id: string;
  state: EmailWireEventConfirmationState;
  outbound?: DeliveryAttempt;
  inbound?: DeliveryAttempt;
  confirmed_at?: string;
}

function protocolInboxPath(eventId: string): string {
  return join(getDocsDir(), "protocol", "inbox", `${eventId}.json`);
}

function wireSentArtifactPath(eventId: string): string {
  return join(getWireSentDir(), `${eventId}.eml`);
}

/**
 * Vitest fixture restore can wipe delivery-attempts* mid-flight. Wire-sent .eml
 * and protocol inbox JSON are durable enough to rehydrate confirmation.
 */
function rehydrateEmailWireAttemptFromArtifacts(
  eventId: string,
  direction: "outbound" | "inbound"
): DeliveryAttempt | undefined {
  if (direction === "outbound") {
    const endpoint = wireSentArtifactPath(eventId);
    if (!existsSync(endpoint)) return undefined;
    return recordDeliveryAttempt({
      event_id: eventId,
      peer_id: "rehydrated",
      channel: "email_wire",
      status: "success",
      direction: "outbound",
      endpoint,
    });
  }
  const endpoint = protocolInboxPath(eventId);
  if (!existsSync(endpoint)) return undefined;
  return recordDeliveryAttempt({
    event_id: eventId,
    peer_id: "rehydrated",
    channel: "email_wire",
    status: "success",
    direction: "inbound",
    endpoint,
  });
}

export function getEmailWireEventConfirmation(eventId: string): EmailWireEventConfirmation {
  const attempts = listDeliveryAttempts({
    eventId,
    channel: "email_wire",
  });
  let outbound = attempts
    .filter(
      (attempt) =>
        attempt.status === "success" &&
        (attempt.direction === undefined || attempt.direction === "outbound")
    )
    .at(-1);
  let inbound = attempts
    .filter((attempt) => attempt.status === "success" && attempt.direction === "inbound")
    .at(-1);

  if (!outbound) {
    outbound = rehydrateEmailWireAttemptFromArtifacts(eventId, "outbound");
  }
  if (!inbound) {
    inbound = rehydrateEmailWireAttemptFromArtifacts(eventId, "inbound");
  }

  if (!outbound) return { event_id: eventId, state: "not_sent", inbound };
  if (!inbound) {
    return {
      event_id: eventId,
      state: "awaiting_inbound_confirmation",
      outbound,
    };
  }
  return {
    event_id: eventId,
    state: "confirmed",
    outbound,
    inbound,
    confirmed_at: inbound.at,
  };
}

export function listUnconfirmedEmailWireEvents(withinDays = 90): EmailWireEventConfirmation[] {
  const cutoff = getClock().nowMs() - withinDays * 86_400_000;
  const eventIds = new Set(
    loadDeliveryAttemptsRegistry()
      .attempts.filter(
        (attempt) =>
          attempt.channel === "email_wire" &&
          attempt.status === "success" &&
          (attempt.direction === undefined || attempt.direction === "outbound") &&
          new Date(attempt.at).getTime() >= cutoff
      )
      .map((attempt) => attempt.event_id)
  );
  return [...eventIds]
    .map(getEmailWireEventConfirmation)
    .filter((confirmation) => confirmation.state === "awaiting_inbound_confirmation");
}

export function countEmailWireAttemptsSince(sinceMs: number): number {
  return loadDeliveryAttemptsRegistry().attempts.filter(
    (a) =>
      a.channel === "email_wire" &&
      a.status !== "skipped" &&
      (a.direction === undefined || a.direction === "outbound") &&
      new Date(a.at).getTime() >= sinceMs
  ).length;
}

export function isEmailWireRateLimited(maxPerHour: number): boolean {
  if (maxPerHour <= 0) return false;
  const oneHourAgo = getClock().nowMs() - 3_600_000;
  return countEmailWireAttemptsSince(oneHourAgo) >= maxPerHour;
}

export function formatDeliveryAttemptsReport(
  attempts: DeliveryAttempt[],
  opts?: { eventId?: string; peerId?: string }
): string {
  const lines = [
    "# Wire delivery attempts",
    "",
    opts?.eventId ? `event_id: ${opts.eventId}` : "",
    opts?.peerId ? `peer_id: ${opts.peerId}` : "",
    "",
  ].filter(Boolean);

  if (!attempts.length) {
    lines.push("(no attempts recorded)");
    return lines.join("\n");
  }

  for (const a of attempts) {
    lines.push(
      `- ${a.at} · ${a.channel} · ${a.status}${a.endpoint ? ` · ${a.endpoint}` : ""}${a.error ? ` · ${a.error}` : ""}`
    );
  }
  return lines.join("\n");
}

export type { DeliveryAttemptStatus };
