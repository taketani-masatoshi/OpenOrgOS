import {
  handoffSchema,
  workOrderDispatchSchema,
  type Handoff,
  type HandoffStatus,
  type WorkOrderDispatch,
} from "../../../schemas/routing.js";
import type { QueueEventType } from "../../../schemas/queue.js";
import { appendAuditEvent } from "../audit-log.js";
import { pushQueueEvent } from "../queue-db.js";
import { loadHandoff, writeHandoffFiles } from "../routing.js";
import { relayWorkOrderComplete } from "../agent-reporting.js";

const ALLOWED: Record<HandoffStatus, HandoffStatus[]> = {
  pending: ["waiting", "dispatched", "blocked", "completed"],
  waiting: ["pending", "blocked"],
  dispatched: ["running", "failed", "pending", "completed"],
  running: ["completed", "failed"],
  failed: ["pending", "blocked", "completed"],
  completed: ["pending"],
  blocked: ["pending"],
};

/** Set when `orchestrate cancel` blocks a node; must not auto-unblock on upstream recovery. */
export const WORK_ORDER_CANCEL_BLOCK_REASON = "cancelled by orchestrate cancel";

/** Every lifecycle transition emits its queue event here — callers must not push duplicates. */
const STATUS_QUEUE_EVENT: Partial<Record<HandoffStatus, QueueEventType>> = {
  waiting: "work_order_waiting",
  dispatched: "dispatch_requested",
  running: "work_order_running",
  completed: "work_order_complete",
  failed: "dispatch_failed",
  pending: "work_order_retry",
};

export function getWorkOrderDispatch(handoff: Handoff): WorkOrderDispatch {
  return workOrderDispatchSchema.parse(handoff.dispatch ?? {});
}

export function assertTransitionAllowed(from: HandoffStatus, to: HandoffStatus): void {
  if (from === to) return;
  const allowed = ALLOWED[from];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid work order transition: ${from} → ${to}`);
  }
}

export interface TransitionContext {
  actor?: string;
  runId?: string;
  traceId?: string;
  error?: string;
  completionNotes?: string;
  incrementAttempt?: boolean;
  skipQueueEvent?: boolean;
  /** Extra queue event fields (manifest id, attempt) merged into the emitted payload. */
  eventPayload?: Record<string, unknown>;
}

export function transitionWorkOrder(id: string, to: HandoffStatus, ctx: TransitionContext = {}): Handoff {
  const handoff = loadHandoff(id);
  assertTransitionAllowed(handoff.status, to);

  const now = new Date().toISOString();
  const dispatch = getWorkOrderDispatch(handoff);
  const nextDispatch: WorkOrderDispatch = { ...dispatch };

  if (ctx.traceId && !nextDispatch.trace_id) {
    nextDispatch.trace_id = ctx.traceId;
  }
  if (ctx.runId) {
    nextDispatch.last_run_id = ctx.runId;
  }
  if (ctx.incrementAttempt) {
    nextDispatch.attempts = dispatch.attempts + 1;
  }
  if (to === "running") {
    nextDispatch.started_at = now;
    nextDispatch.last_error = undefined;
  }
  if (to === "failed") {
    nextDispatch.finished_at = now;
    if (ctx.error) nextDispatch.last_error = ctx.error.slice(0, 500);
  }
  if (to === "completed") {
    nextDispatch.finished_at = now;
    nextDispatch.last_error = undefined;
  }
  if (to === "pending" && (handoff.status === "failed" || handoff.status === "completed")) {
    nextDispatch.finished_at = undefined;
    nextDispatch.started_at = undefined;
    nextDispatch.last_error = undefined;
  }

  const updated = handoffSchema.parse({
    ...handoff,
    status: to,
    dispatch: nextDispatch,
    completion_notes: to === "completed" ? (ctx.completionNotes ?? handoff.completion_notes) : handoff.completion_notes,
  });

  writeHandoffFiles(updated, undefined, { audit: false });

  if (!ctx.skipQueueEvent) {
    const eventType = STATUS_QUEUE_EVENT[to];
    if (eventType) {
      pushQueueEvent({
        type: eventType,
        ref: updated.id,
        payload: {
          agent: updated.to_agent,
          trace_id: nextDispatch.trace_id,
          run_id: ctx.runId,
          error: ctx.error,
          ...ctx.eventPayload,
        },
      });
    }
  }

  appendAuditEvent({
    event: "escalate",
    ref: updated.id,
    actor: ctx.actor ?? updated.from_agent,
    detail: `work_order:${handoff.status}→${to}`,
  });

  if (to === "completed") {
    relayWorkOrderComplete(updated, ctx.completionNotes);
  }

  return updated;
}

export function isCancelledWorkOrder(handoff: Handoff): boolean {
  if (handoff.status !== "blocked") return false;
  return getWorkOrderDispatch(handoff).last_error === WORK_ORDER_CANCEL_BLOCK_REASON;
}

export function isClosedWorkOrder(handoff: Handoff): boolean {
  return handoff.status === "completed" || isCancelledWorkOrder(handoff);
}

export function completeWorkOrderViaState(id: string, notes?: string): Handoff {
  const handoff = loadHandoff(id);
  if (handoff.status === "completed") return handoff;
  return transitionWorkOrder(id, "completed", { completionNotes: notes });
}

export function reopenWorkOrderViaState(id: string): Handoff {
  const handoff = loadHandoff(id);
  if (handoff.status === "pending") return handoff;
  return transitionWorkOrder(id, "pending");
}

export function newOrchestrationTraceId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `TRC-${date}-${suffix}`;
}
