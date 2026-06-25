import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  queueEventSchema,
  type QueueEvent,
  type QueueEventType,
  type QueueEventStatus,
} from "../../schemas/queue.js";
import { getTenantId } from "./tenant.js";
import { DOCS_REPORTS_DIR } from "./utils.js";
import { appendAuditEvent } from "./audit-log.js";
import { appendJsonl, loadJsonl, updateJsonlLine } from "./jsonl-store.js";

export const QUEUE_SUBDIR = join("routing-queue", "queue");
export const QUEUE_EVENTS_FILE = "events.jsonl";
export const RESULTS_SUBDIR = "results";

export function queueDir(): string {
  const dir = join(DOCS_REPORTS_DIR, QUEUE_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resultsDir(): string {
  const dir = join(DOCS_REPORTS_DIR, "routing-queue", RESULTS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function queueEventsPath(): string {
  return join(queueDir(), QUEUE_EVENTS_FILE);
}

function generateQueueId(): string {
  return `Q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface PushQueueOptions {
  type: QueueEventType;
  ref: string;
  payload?: Record<string, unknown>;
  tenant?: string;
  status?: QueueEventStatus;
}

export function pushQueueEvent(options: PushQueueOptions): QueueEvent {
  const event = queueEventSchema.parse({
    id: generateQueueId(),
    created_at: new Date().toISOString(),
    tenant: options.tenant ?? getTenantId(),
    type: options.type,
    ref: options.ref,
    status: options.status ?? "pending",
    payload: options.payload,
  });
  appendJsonl(queueEventsPath(), event);
  appendAuditEvent({
    event: "escalate",
    ref: event.id,
    detail: `queue:${event.type}:${event.ref}`,
  });
  return event;
}

export function loadQueueEvents(filter?: {
  status?: QueueEventStatus;
  type?: QueueEventType;
  tenant?: string;
}): QueueEvent[] {
  const events = loadJsonl(queueEventsPath(), (raw) => queueEventSchema.parse(raw));

  return events.filter((e) => {
    if (filter?.status && e.status !== filter.status) return false;
    if (filter?.type && e.type !== filter.type) return false;
    if (filter?.tenant && e.tenant !== filter.tenant) return false;
    return true;
  });
}

export function updateQueueEvent(
  id: string,
  update: Partial<Pick<QueueEvent, "status" | "error" | "processed_at">>
): QueueEvent | undefined {
  return updateJsonlLine(
    queueEventsPath(),
    id,
    (raw) => queueEventSchema.parse(raw),
    (event) =>
      queueEventSchema.parse({
        ...event,
        ...update,
        processed_at: update.processed_at ?? new Date().toISOString(),
      })
  );
}

export function writeWorkOrderResult(
  workOrderId: string,
  result: { summary: string; notes?: string; agent: string; artifacts?: string[] }
): string {
  const path = join(resultsDir(), `${workOrderId}.yaml`);
  const body = {
    work_order_id: workOrderId,
    agent: result.agent,
    completed_at: new Date().toISOString(),
    summary: result.summary,
    notes: result.notes,
    artifacts: result.artifacts ?? [],
  };
  writeFileSync(path, JSON.stringify(body, null, 2), "utf-8");
  return path;
}

export function loadWorkOrderResult(workOrderId: string): {
  work_order_id: string;
  agent: string;
  completed_at: string;
  summary: string;
  notes?: string;
  artifacts: string[];
} | undefined {
  const path = join(resultsDir(), `${workOrderId}.yaml`);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function listWorkOrderResults(): string[] {
  const dir = resultsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, ""));
}
