import {
  witnessPendingRegistrySchema,
  type WitnessPendingEntry,
  type WitnessPendingRegistry,
} from "../../../schemas/protocol/witness-pending.js";
import { getWitnessPendingYamlPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";
import { existsSync } from "node:fs";

export function loadWitnessPending(): WitnessPendingRegistry {
  const path = getWitnessPendingYamlPath();
  if (!existsSync(path)) {
    return { pending: [] };
  }
  return readYamlFile(path, witnessPendingRegistrySchema);
}

export function saveWitnessPending(registry: WitnessPendingRegistry): void {
  writeYamlFile(getWitnessPendingYamlPath(), { ...registry, as_of: currentDate() });
}

export function enqueueWitnessPending(entry: Omit<WitnessPendingEntry, "attempts" | "created_at"> & {
  attempts?: number;
  created_at?: string;
}): WitnessPendingEntry {
  const registry = loadWitnessPending();
  const key = `${entry.hub_id}:${entry.event_id}:${entry.side}`;
  const existingIdx = registry.pending.findIndex(
    (p) => `${p.hub_id}:${p.event_id}:${p.side}` === key
  );
  const record: WitnessPendingEntry = {
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
  saveWitnessPending(registry);
  return existingIdx >= 0 ? registry.pending[existingIdx]! : record;
}

export function removeWitnessPending(hubId: string, eventId: string, side: WitnessPendingEntry["side"]): void {
  const registry = loadWitnessPending();
  registry.pending = registry.pending.filter(
    (p) => !(p.hub_id === hubId && p.event_id === eventId && p.side === side)
  );
  saveWitnessPending(registry);
}

export function listWitnessPending(): WitnessPendingEntry[] {
  return loadWitnessPending().pending;
}
