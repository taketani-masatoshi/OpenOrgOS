import {
  wirePendingRegistrySchema,
  type WirePendingEntry,
  type WirePendingRegistry,
} from "../../../schemas/protocol/wire-pending.js";
import { getWirePendingYamlPath } from "./paths.js";
import { createYamlPendingQueueStore } from "./yaml-pending-queue.js";

const store = createYamlPendingQueueStore<
  WirePendingEntry,
  WirePendingRegistry
>({
  getPath: getWirePendingYamlPath,
  schema: wirePendingRegistrySchema,
  emptyRegistry: () => ({ pending: [] }),
  entryKey: (entry) => `${entry.peer_id}:${entry.event_id}`,
});

export function loadWirePending(): WirePendingRegistry {
  return store.load();
}

export function saveWirePending(registry: WirePendingRegistry): void {
  store.save(registry);
}

export function enqueueWirePending(
  entry: Omit<WirePendingEntry, "attempts" | "created_at"> & {
    attempts?: number;
    created_at?: string;
  }
): WirePendingEntry {
  return store.enqueue(entry);
}

export function removeWirePending(peerId: string, eventId: string): void {
  store.remove((p) => p.peer_id === peerId && p.event_id === eventId);
}

export function listWirePending(): WirePendingEntry[] {
  return store.list();
}
