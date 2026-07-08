import type { AuditEvent, AuditEventType } from "../../../schemas/audit-log.js";
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
  agent_mission_created: "committee.agent.mission.created",
  agent_report_submitted: "committee.agent.report.submitted",
  agent_relay_coo: "committee.agent.relay.coo",
  agent_relay_steward: "committee.agent.relay.steward",
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

const QUEUE_TO_AUDIT_EVENT: Partial<Record<QueueEventType, AuditEventType>> = {
  work_order_created: "handoff",
  work_order_complete: "handoff",
  dispatch_requested: "route_dispatch",
  dispatch_complete: "route_dispatch",
  webhook_received: "validate",
  merge_complete: "handoff",
  pr_requested: "handoff",
  pr_created: "handoff",
  secretary_consult: "escalate",
  agent_mission_created: "escalate",
  agent_report_submitted: "escalate",
  agent_relay_coo: "escalate",
  agent_relay_steward: "escalate",
};

export function auditEventTypeForQueueEvent(type: QueueEventType): AuditEventType {
  return QUEUE_TO_AUDIT_EVENT[type] ?? "escalate";
}

export function mapAuditEventToOrgPayload(event: AuditEvent): OrgEvent {
  return {
    type: "org.audit.attested",
    payload: {
      scope: "internal",
      kind: "operational.recorded",
      approval_id: event.id,
      subject_type: `operational.${event.event}`,
      subject_ref: event.ref,
      operational: {
        audit_id: event.id,
        audit_event: event.event,
        actor: event.actor,
        detail: event.detail,
        timestamp: event.timestamp,
        event_id: event.event_id,
        transaction_id: event.transaction_id,
      },
    },
  };
}
