import {
  witnessPendingRegistrySchema,
  type WitnessPendingEntry,
  type WitnessPendingRegistry,
} from "../../../schemas/protocol/witness-pending.js";
import { getWitnessPendingYamlPath } from "./paths.js";
import { createYamlPendingQueueStore } from "./yaml-pending-queue.js";
import {
  appendWitnessPendingLifecycle,
  type WitnessPendingLifecycleReason,
} from "./witness-pending-lifecycle.js";

const store = createYamlPendingQueueStore<WitnessPendingEntry, WitnessPendingRegistry>({
  getPath: getWitnessPendingYamlPath,
  schema: witnessPendingRegistrySchema,
  emptyRegistry: () => ({ pending: [] }),
  entryKey: (entry) => `${entry.hub_id}:${entry.event_id}:${entry.side}`,
  onArchive: (entry, reason) => {
    appendWitnessPendingLifecycle(entry, reason as WitnessPendingLifecycleReason);
  },
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

export function archiveWitnessPending(
  hubId: string,
  eventId: string,
  side: WitnessPendingEntry["side"],
  reason: WitnessPendingLifecycleReason
): WitnessPendingEntry[] {
  return store.archive(
    (p) => p.hub_id === hubId && p.event_id === eventId && p.side === side,
    reason
  );
}

/** @deprecated Prefer {@link archiveWitnessPending} with an explicit lifecycle reason. */
export function removeWitnessPending(
  hubId: string,
  eventId: string,
  side: WitnessPendingEntry["side"]
): void {
  archiveWitnessPending(hubId, eventId, side, "removed");
}

export function listWitnessPending(): WitnessPendingEntry[] {
  return store.list();
}
