import { appendJsonl } from "../jsonl-store.js";
import { getClock } from "../runtime-context.js";
import { join } from "node:path";
import { getProtocolDataDir } from "./paths.js";
import type { WitnessPendingEntry } from "../../../schemas/protocol/witness-pending.js";

export type WitnessPendingLifecycleReason = "attested" | "removed";

export interface WitnessPendingLifecycleRecord {
  recorded_at: string;
  reason: WitnessPendingLifecycleReason;
  entry: WitnessPendingEntry;
}

export function getWitnessPendingLifecyclePath(): string {
  return join(getProtocolDataDir(), "witness-pending-lifecycle.jsonl");
}

export function appendWitnessPendingLifecycle(
  entry: WitnessPendingEntry,
  reason: WitnessPendingLifecycleReason
): void {
  const record: WitnessPendingLifecycleRecord = {
    recorded_at: getClock().nowIso(),
    reason,
    entry,
  };
  appendJsonl(getWitnessPendingLifecyclePath(), record);
}
