import type { AuditEvent } from "../../../schemas/audit-log.js";
import type { QueueEvent, QueueEventType } from "../../../schemas/queue.js";
import type { OrgEvent } from "../../../schemas/protocol/org-event.js";

const QUEUE_TO_ORG_EVENT: Partial<Record<QueueEventType, string>> = {
  work_order_created: "committee.work_order.created",
  work_order_complete: "committee.work_order.completed",
  dispatch_requested: "committee.dispatch.requested",
  dispatch_complete: "committee.dispatch.completed",
  webhook_received: "committee.webhook.received",
  merge_complete: "committee.merge.completed",
  pr_requested: "committee.pr.requested",
  pr_created: "committee.pr.created",
  secretary_consult: "committee.secretary.consult",
};

export function mapQueueEventToOrgEvent(event: QueueEvent): OrgEvent {
  const mappedType = QUEUE_TO_ORG_EVENT[event.type] ?? `committee.queue.${event.type}`;
  return {
    type: mappedType,
    payload: {
      queue_id: event.id,
      ref: event.ref,
      status: event.status,
      ...(event.payload ?? {}),
    },
  };
}

export function mapAuditEventToOrgPayload(event: AuditEvent): OrgEvent {
  return {
    type: "org.audit.attested",
    payload: {
      audit_id: event.id,
      audit_event: event.event,
      ref: event.ref,
      actor: event.actor,
      detail: event.detail,
      timestamp: event.timestamp,
      event_id: event.event_id,
      transaction_id: event.transaction_id,
    },
  };
}
