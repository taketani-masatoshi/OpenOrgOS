import {
  wirePendingRegistrySchema,
  type WirePendingEntry,
  type WirePendingRegistry,
} from "../../../schemas/protocol/wire-pending.js";
import { getWirePendingYamlPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";
import { existsSync } from "node:fs";

export function loadWirePending(): WirePendingRegistry {
  const path = getWirePendingYamlPath();
  if (!existsSync(path)) {
    return { pending: [] };
  }
  return readYamlFile(path, wirePendingRegistrySchema);
}

export function saveWirePending(registry: WirePendingRegistry): void {
  writeYamlFile(getWirePendingYamlPath(), { ...registry, as_of: currentDate() });
}

export function enqueueWirePending(
  entry: Omit<WirePendingEntry, "attempts" | "created_at"> & {
    attempts?: number;
    created_at?: string;
  }
): WirePendingEntry {
  const registry = loadWirePending();
  const key = `${entry.peer_id}:${entry.event_id}`;
  const existingIdx = registry.pending.findIndex(
    (p) => `${p.peer_id}:${p.event_id}` === key
  );
  const record: WirePendingEntry = {
    ...entry,
    attempts: entry.attempts ?? 0,
    created_at: entry.created_at ?? new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    registry.pending[existingIdx] = {
      ...registry.pending[existingIdx]!,
      ...record,
      attempts: (registry.pending[existingIdx]!.attempts ?? 0) + 1,
    };
  } else {
    registry.pending.push(record);
  }
  saveWirePending(registry);
  return existingIdx >= 0 ? registry.pending[existingIdx]! : record;
}

export function removeWirePending(peerId: string, eventId: string): void {
  const registry = loadWirePending();
  registry.pending = registry.pending.filter(
    (p) => !(p.peer_id === peerId && p.event_id === eventId)
  );
  saveWirePending(registry);
}

export function listWirePending(): WirePendingEntry[] {
  return loadWirePending().pending;
}
