import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  wireDeliveredRegistrySchema,
  type WireDeliveredRegistry,
} from "../../../schemas/protocol/wire-delivered.js";
import { getProtocolDataDir } from "./paths.js";
import { readYamlFile, writeYamlFile, currentDate } from "../utils.js";
import { getClock } from "../runtime-context.js";

function getWireDeliveredPath(): string {
  return join(getProtocolDataDir(), "wire-delivered.yaml");
}

export function loadWireDeliveredRegistry(): WireDeliveredRegistry {
  const path = getWireDeliveredPath();
  if (!existsSync(path)) {
    return wireDeliveredRegistrySchema.parse({ delivered: [] });
  }
  return readYamlFile(path, wireDeliveredRegistrySchema);
}

export function markWireDelivered(peerId: string, eventId: string, endpoint?: string): void {
  const registry = loadWireDeliveredRegistry();
  const key = `${peerId}:${eventId}`;
  const existing = registry.delivered.findIndex((d) => `${d.peer_id}:${d.event_id}` === key);
  const record = {
    peer_id: peerId,
    event_id: eventId,
    delivered_at: getClock().nowIso(),
    endpoint,
  };
  if (existing >= 0) {
    registry.delivered[existing] = record;
  } else {
    registry.delivered.push(record);
  }
  writeYamlFile(getWireDeliveredPath(), { ...registry, as_of: currentDate() });
}

export function isWireDelivered(peerId: string, eventId: string): boolean {
  return loadWireDeliveredRegistry().delivered.some(
    (d) => d.peer_id === peerId && d.event_id === eventId
  );
}

export function isEventDelivered(eventId: string): boolean {
  return loadWireDeliveredRegistry().delivered.some((d) => d.event_id === eventId);
}
