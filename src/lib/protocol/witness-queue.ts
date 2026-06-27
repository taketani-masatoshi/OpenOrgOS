import {
  witnessPendingRegistrySchema,
  type WitnessPendingEntry,
  type WitnessPendingRegistry,
} from "../../../schemas/protocol/witness-pending.js";
import { getWitnessPendingYamlPath } from "./paths.js";
import { createYamlPendingQueueStore } from "./yaml-pending-queue.js";

const store = createYamlPendingQueueStore<
  WitnessPendingEntry,
  WitnessPendingRegistry
>({
  getPath: getWitnessPendingYamlPath,
  schema: witnessPendingRegistrySchema,
  emptyRegistry: () => ({ pending: [] }),
  entryKey: (entry) => `${entry.hub_id}:${entry.event_id}:${entry.side}`,
});

export function loadWitnessPending(): WitnessPendingRegistry {
  return store.load();
}

export function saveWitnessPending(registry: WitnessPendingRegistry): void {
  store.save(registry);
}

export function enqueueWitnessPending(
  entry: Omit<WitnessPendingEntry, "attempts" | "created_at"> & {
    attempts?: number;
    created_at?: string;
  }
): WitnessPendingEntry {
  return store.enqueue(entry);
}

export function removeWitnessPending(
  hubId: string,
  eventId: string,
  side: WitnessPendingEntry["side"]
): void {
  store.remove((p) => p.hub_id === hubId && p.event_id === eventId && p.side === side);
}

export function listWitnessPending(): WitnessPendingEntry[] {
  return store.list();
}
