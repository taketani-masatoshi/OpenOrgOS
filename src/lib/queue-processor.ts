import { loadQueueEvents, updateQueueEvent } from "./queue-db.js";
import { registerWorkOrderResult, mergeWorkOrderResults } from "./work-order-merge.js";

export interface QueueDrainInternalOptions {
  dryRun?: boolean;
}

/** Shared drain logic for CLI and webhook server */
export function runQueueDrainInternal(opts: QueueDrainInternalOptions = {}): number {
  const pending = loadQueueEvents({ status: "pending" });
  let processed = 0;

  for (const event of pending) {
    if (opts.dryRun) continue;

    try {
      if (event.type === "work_order_complete" && event.payload?.summary) {
        registerWorkOrderResult(
          event.ref,
          String(event.payload.summary),
          event.payload.notes ? String(event.payload.notes) : undefined
        );
      }
      if (event.type === "webhook_received" && event.payload?.parent_id) {
        mergeWorkOrderResults({ id: String(event.payload.parent_id) });
      }
      updateQueueEvent(event.id, { status: "done" });
      processed++;
    } catch (err) {
      updateQueueEvent(event.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return processed;
}
