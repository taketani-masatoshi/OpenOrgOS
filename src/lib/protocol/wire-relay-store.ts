import { existsSync } from "node:fs";
import { wireRelayRegistrySchema, type WireRelayEntry } from "../../../schemas/protocol/wire-relay.js";
import { getWireRelayYamlPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";
import { randomUUID } from "node:crypto";

export function loadWireRelayRegistry() {
  const path = getWireRelayYamlPath();
  if (!existsSync(path)) {
    return wireRelayRegistrySchema.parse({ queue: [] });
  }
  return readYamlFile(path, wireRelayRegistrySchema);
}

export function saveWireRelayRegistry(registry: ReturnType<typeof loadWireRelayRegistry>): void {
  writeYamlFile(getWireRelayYamlPath(), { ...registry, as_of: currentDate() });
}

export function enqueueWireRelay(
  entry: Omit<WireRelayEntry, "relay_id" | "enqueued_at"> & {
    relay_id?: string;
    enqueued_at?: string;
  }
): WireRelayEntry {
  const registry = loadWireRelayRegistry();
  const record: WireRelayEntry = {
    relay_id: entry.relay_id ?? randomUUID(),
    origin_org_uri: entry.origin_org_uri,
    destination_org_uri: entry.destination_org_uri,
    event_id: entry.event_id,
    envelope_digest: entry.envelope_digest,
    enqueued_at: entry.enqueued_at ?? new Date().toISOString(),
    envelope_path: entry.envelope_path,
  };
  const idx = registry.queue.findIndex((q) => q.event_id === record.event_id);
  if (idx >= 0) {
    registry.queue[idx] = { ...registry.queue[idx]!, ...record };
  } else {
    registry.queue.push(record);
  }
  saveWireRelayRegistry(registry);
  return record;
}

export function listWireRelayPending(destinationOrgUri?: string): WireRelayEntry[] {
  const registry = loadWireRelayRegistry();
  return registry.queue.filter((q) => {
    if (q.delivered_at) return false;
    if (destinationOrgUri && q.destination_org_uri !== destinationOrgUri) return false;
    return true;
  });
}

export function markWireRelayDelivered(relayId: string): void {
  const registry = loadWireRelayRegistry();
  const entry = registry.queue.find((q) => q.relay_id === relayId);
  if (!entry) return;
  entry.delivered_at = new Date().toISOString();
  saveWireRelayRegistry(registry);
}

export function findWireRelayByEventId(eventId: string): WireRelayEntry | undefined {
  return loadWireRelayRegistry().queue.find((q) => q.event_id === eventId);
}
