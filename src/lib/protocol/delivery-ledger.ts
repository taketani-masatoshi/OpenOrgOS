import { existsSync } from "node:fs";
import {
  deliveryAttemptsRegistrySchema,
  type DeliveryAttempt,
  type DeliveryChannel,
  type DeliveryAttemptStatus,
} from "../../../schemas/protocol/delivery-attempt.js";
import { getDeliveryAttemptsPath } from "./paths.js";
import { readYamlFile, writeYamlFile, currentDate } from "../utils.js";

export function loadDeliveryAttemptsRegistry() {
  const path = getDeliveryAttemptsPath();
  if (!existsSync(path)) {
    return deliveryAttemptsRegistrySchema.parse({ attempts: [] });
  }
  return readYamlFile(path, deliveryAttemptsRegistrySchema);
}

export function recordDeliveryAttempt(entry: Omit<DeliveryAttempt, "at"> & { at?: string }): DeliveryAttempt {
  const registry = loadDeliveryAttemptsRegistry();
  const record: DeliveryAttempt = {
    ...entry,
    at: entry.at ?? new Date().toISOString(),
  };
  registry.attempts.push(record);
  writeYamlFile(getDeliveryAttemptsPath(), { ...registry, as_of: currentDate() });
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
  const cutoff = Date.now() - withinDays * 86_400_000;
  return loadDeliveryAttemptsRegistry().attempts.some(
    (a) =>
      a.channel === "email_wire" &&
      a.status === "success" &&
      (a.direction === undefined || a.direction === "outbound") &&
      new Date(a.at).getTime() >= cutoff
  );
}

export function hasSuccessfulEmailWireIngest(withinDays = 90): boolean {
  const cutoff = Date.now() - withinDays * 86_400_000;
  return loadDeliveryAttemptsRegistry().attempts.some(
    (a) =>
      a.channel === "email_wire" &&
      a.status === "success" &&
      a.direction === "inbound" &&
      new Date(a.at).getTime() >= cutoff
  );
}

export type EmailWireEventConfirmationState =
  | "not_sent"
  | "awaiting_inbound_confirmation"
  | "confirmed";

export interface EmailWireEventConfirmation {
  event_id: string;
  state: EmailWireEventConfirmationState;
  outbound?: DeliveryAttempt;
  inbound?: DeliveryAttempt;
  confirmed_at?: string;
}

export function getEmailWireEventConfirmation(
  eventId: string
): EmailWireEventConfirmation {
  const attempts = listDeliveryAttempts({
    eventId,
    channel: "email_wire",
  });
  const outbound = attempts
    .filter(
      (attempt) =>
        attempt.status === "success" &&
        (attempt.direction === undefined || attempt.direction === "outbound")
    )
    .at(-1);
  const inbound = attempts
    .filter(
      (attempt) =>
        attempt.status === "success" && attempt.direction === "inbound"
    )
    .at(-1);
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

export function listUnconfirmedEmailWireEvents(
  withinDays = 90
): EmailWireEventConfirmation[] {
  const cutoff = Date.now() - withinDays * 86_400_000;
  const eventIds = new Set(
    loadDeliveryAttemptsRegistry().attempts
      .filter(
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
  const oneHourAgo = Date.now() - 3_600_000;
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
