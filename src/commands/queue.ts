import { loadQueueEvents, pushQueueEvent } from "../lib/queue-db.js";
import { runQueueDrainInternal } from "../lib/queue-processor.js";
import { setTenantId } from "../lib/tenant.js";
import type { QueueEventStatus, QueueEventType } from "../../schemas/queue.js";

export interface QueuePushOptions {
  type: string;
  ref: string;
  tenant?: string;
  payload?: string;
}

export function runQueuePush(opts: QueuePushOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const parsed = opts.type as QueueEventType;
  let payload: Record<string, unknown> | undefined;
  if (opts.payload) {
    try {
      payload = JSON.parse(opts.payload);
    } catch {
      payload = { raw: opts.payload };
    }
  }
  const event = pushQueueEvent({ type: parsed, ref: opts.ref, payload, tenant: opts.tenant });
  console.log(`✓ ${event.id} · ${event.type} · ${event.ref}`);
}

export interface QueueListOptions {
  status?: string;
  type?: string;
  tenant?: string;
  json?: boolean;
}

export function runQueueList(opts: QueueListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const events = loadQueueEvents({
    status: opts.status as QueueEventStatus | undefined,
    type: opts.type as QueueEventType | undefined,
    tenant: opts.tenant,
  });

  if (opts.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    console.log("Queue empty.");
    return;
  }

  console.log("| id | type | ref | status | created |");
  console.log("|----|------|-----|--------|---------|");
  for (const e of events.slice(-30)) {
    console.log(`| ${e.id} | ${e.type} | ${e.ref} | ${e.status} | ${e.created_at.slice(0, 10)} |`);
  }
}

export interface QueueDrainOptions {
  tenant?: string;
  dryRun?: boolean;
}

export function runQueueDrain(opts: QueueDrainOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const pending = loadQueueEvents({ status: "pending" });
  if (pending.length === 0) {
    console.log("No pending queue events.");
    return;
  }

  for (const event of pending) {
    console.log(`→ ${event.type} ${event.ref}`);
  }

  if (opts.dryRun) return;

  const processed = runQueueDrainInternal({});
  console.log(`✓ processed ${processed} event(s)`);
}
