import {
  wirePendingRegistrySchema,
  type WirePendingEntry,
  type WirePendingRegistry,
} from "../../../schemas/protocol/wire-pending.js";
import { getWirePendingYamlPath } from "./paths.js";
import { createYamlPendingQueueStore } from "./yaml-pending-queue.js";
import {
  appendWirePendingLifecycle,
  type WirePendingLifecycleReason,
} from "./wire-pending-lifecycle.js";

const store = createYamlPendingQueueStore<
  WirePendingEntry,
  WirePendingRegistry
>({
  getPath: getWirePendingYamlPath,
  schema: wirePendingRegistrySchema,
  emptyRegistry: () => ({ pending: [] }),
  entryKey: (entry) => `${entry.peer_id}:${entry.event_id}`,
  onArchive: (entry, reason) => {
    appendWirePendingLifecycle(entry, reason as WirePendingLifecycleReason);
  },
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

export function archiveWirePending(
  peerId: string,
  eventId: string,
  reason: WirePendingLifecycleReason
): WirePendingEntry[] {
  return store.archive((p) => p.peer_id === peerId && p.event_id === eventId, reason);
}

/** @deprecated Prefer {@link archiveWirePending} with an explicit lifecycle reason. */
export function removeWirePending(peerId: string, eventId: string): void {
  archiveWirePending(peerId, eventId, "removed");
}

export function listWirePending(): WirePendingEntry[] {
  return store.list();
}
