import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  queueEventSchema,
  queueStatusRecordSchema,
  type QueueEvent,
  type QueueEventType,
  type QueueEventStatus,
  type QueueStatusRecord,
} from "../../schemas/queue.js";
import { getTenantId } from "./tenant.js";
import { getDocsReportsDir, writeCanonicalFile } from "./utils.js";
import { appendAuditEvent } from "./audit-log.js";
import { auditEventTypeForQueueEvent } from "./protocol/map-internal.js";
import { appendJsonl } from "./jsonl-store.js";
import { getClock, getIdGenerator } from "./runtime-context.js";

export const QUEUE_SUBDIR = join("routing-queue", "queue");
export const QUEUE_EVENTS_FILE = "events.jsonl";
export const RESULTS_SUBDIR = "results";

export function queueDir(): string {
  const dir = join(getDocsReportsDir(), QUEUE_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resultsDir(): string {
  const dir = join(getDocsReportsDir(), "routing-queue", RESULTS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function queueEventsPath(): string {
  return join(queueDir(), QUEUE_EVENTS_FILE);
}

function generateQueueId(): string {
  return getIdGenerator().uniqueId("Q");
}

function generateQueueStatusRecordId(): string {
  return getIdGenerator().uniqueId("QST");
}

type QueueJsonlRecord =
  | { kind: "event"; data: QueueEvent }
  | { kind: "status"; data: QueueStatusRecord };

function parseQueueJsonlLine(raw: unknown): QueueJsonlRecord | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  if (record.record_type === "queue_status") {
    return { kind: "status", data: queueStatusRecordSchema.parse(raw) };
  }
  return { kind: "event", data: queueEventSchema.parse(raw) };
}

/** Replay append-only queue jsonl into current event state (latest status wins). */
export function reduceQueueEvents(records: QueueJsonlRecord[]): QueueEvent[] {
  const byId = new Map<string, QueueEvent>();
  for (const record of records) {
    if (record.kind === "event") {
      byId.set(record.data.id, record.data);
      continue;
    }
    const current = byId.get(record.data.target_id);
    if (!current) continue;
    byId.set(
      record.data.target_id,
      queueEventSchema.parse({
        ...current,
        status: record.data.status,
        error: record.data.error ?? current.error,
        processed_at: record.data.processed_at,
      })
    );
  }
  return [...byId.values()];
}

function loadQueueJsonlRecords(): QueueJsonlRecord[] {
  const path = queueEventsPath();
  if (!existsSync(path)) return [];
  const out: QueueJsonlRecord[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n").filter(Boolean)) {
    try {
      const parsed = parseQueueJsonlLine(JSON.parse(line));
      if (parsed) out.push(parsed);
    } catch {
      // skip corrupt lines
    }
  }
  return out;
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
    created_at: getClock().nowIso(),
    tenant: options.tenant ?? getTenantId(),
    type: options.type,
    ref: options.ref,
    status: options.status ?? "pending",
    payload: options.payload,
  });
  appendJsonl(queueEventsPath(), event);
  appendAuditEvent({
    event: auditEventTypeForQueueEvent(event.type),
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
  const events = reduceQueueEvents(loadQueueJsonlRecords());

  return events.filter((e) => {
    if (filter?.status && e.status !== filter.status) return false;
    if (filter?.type && e.type !== filter.type) return false;
    if (filter?.tenant && e.tenant !== filter.tenant) return false;
    return true;
  });
}

export function appendQueueStatusEvent(
  targetId: string,
  update: Partial<Pick<QueueEvent, "status" | "error" | "processed_at">>
): QueueEvent | undefined {
  const current = loadQueueEvents().find((event) => event.id === targetId);
  if (!current) return undefined;
  if (!update.status && !update.error && !update.processed_at) return current;

  const processedAt = update.processed_at ?? getClock().nowIso();
  const statusRecord = queueStatusRecordSchema.parse({
    record_type: "queue_status",
    id: generateQueueStatusRecordId(),
    target_id: targetId,
    status: update.status ?? current.status,
    error: update.error,
    processed_at: processedAt,
    recorded_at: getClock().nowIso(),
  });
  appendJsonl(queueEventsPath(), statusRecord);

  return queueEventSchema.parse({
    ...current,
    ...update,
    status: update.status ?? current.status,
    processed_at: processedAt,
  });
}

/**
 * @deprecated Use {@link appendQueueStatusEvent}. Appends a status record (no in-place jsonl rewrite).
 */
export function updateQueueEvent(
  id: string,
  update: Partial<Pick<QueueEvent, "status" | "error" | "processed_at">>
): QueueEvent | undefined {
  return appendQueueStatusEvent(id, update);
}

export function writeWorkOrderResult(
  workOrderId: string,
  result: { summary: string; notes?: string; agent: string; artifacts?: string[] }
): string {
  const path = join(resultsDir(), `${workOrderId}.yaml`);
  const body = {
    work_order_id: workOrderId,
    agent: result.agent,
    completed_at: getClock().nowIso(),
    summary: result.summary,
    notes: result.notes,
    artifacts: result.artifacts ?? [],
  };
  writeCanonicalFile(path, JSON.stringify(body, null, 2));
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
