import { appendJsonl } from "../jsonl-store.js";
import { getClock } from "../runtime-context.js";
import { join } from "node:path";
import { getProtocolDataDir } from "./paths.js";
import type { WirePendingEntry } from "../../../schemas/protocol/wire-pending.js";

export type WirePendingLifecycleReason = "delivered" | "dead_letter" | "removed";

export interface WirePendingLifecycleRecord {
  recorded_at: string;
  reason: WirePendingLifecycleReason;
  entry: WirePendingEntry;
}

export function getWirePendingLifecyclePath(): string {
  return join(getProtocolDataDir(), "wire-pending-lifecycle.jsonl");
}

export function appendWirePendingLifecycle(
  entry: WirePendingEntry,
  reason: WirePendingLifecycleReason
): void {
  const record: WirePendingLifecycleRecord = {
    recorded_at: getClock().nowIso(),
    reason,
    entry,
  };
  appendJsonl(getWirePendingLifecyclePath(), record);
}
