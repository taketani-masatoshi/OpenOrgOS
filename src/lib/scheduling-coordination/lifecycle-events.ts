import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { appendAuditEvent } from "../audit-log.js";
import {
  createCompanyEvent,
  listCompanyEvents,
} from "../company-events.js";
import { currentDate } from "../utils.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";
import { syncSalesDemoDealOnConfirm } from "../sales-demo-confirm.js";
import { SchedulingCaseNotFoundError } from "./errors.js";

export type SchedulingLifecycleStage =
  | "created"
  | "proposal_sent"
  | "confirmed"
  | "notification_sent"
  | "cancelled"
  | "rescheduled";

function stageTitle(caseRow: SchedulingCase, stage: SchedulingLifecycleStage): string {
  const labels: Record<SchedulingLifecycleStage, string> = {
    created: "日程調整起票",
    proposal_sent: "日程候補送信完了",
    confirmed: "日程確定",
    notification_sent: "日程確定通知送信完了",
    cancelled: "日程調整中止",
    rescheduled: "日程再調整開始",
  };
  return `${labels[stage]} — ${caseRow.title}`;
}

export function recordSchedulingLifecycleEvent(
  caseId: string,
  stage: SchedulingLifecycleStage,
  actor = "secretary"
): SchedulingCase {
  let current = findSchedulingCase(caseId);
  if (!current) throw new SchedulingCaseNotFoundError(caseId);
  const stageRevision =
    stage === "created" || stage === "cancelled" ? 0 : current.proposal_revision;
  if (
    current.lifecycle_events.some(
      (record) =>
        record.stage === stage && record.proposal_revision === stageRevision
    )
  ) {
    return current;
  }

  const existing = listCompanyEvents({ includeVoided: true }).find(
    (event) =>
      event.related?.meeting_ref === current!.id &&
      event.notes?.includes(`scheduling-stage:${stage}`) &&
      event.notes?.includes(`proposal-revision:${stageRevision}`)
  );
  const event =
    existing ??
    createCompanyEvent({
      kind: "meeting",
      title: stageTitle(current, stage),
      occurredAt: currentDate(),
      slug: `schedule-${current.id.toLowerCase()}-${stage.replaceAll("_", "-")}-r${stageRevision}`,
      related: { meeting_ref: current.id },
      notes: `scheduling-stage:${stage}; proposal-revision:${stageRevision}; actor:${actor}`,
    });
  appendAuditEvent({
    event: "handoff",
    ref: current.id,
    actor,
    detail: `scheduling lifecycle ${stage}`,
    transaction_id: event.id,
  });
  current = updateSchedulingCase(current.id, current.revision, (row) => ({
    ...row,
    lifecycle_events: [
      ...row.lifecycle_events,
      {
        stage,
        proposal_revision: stageRevision,
        event_id: event.id,
        recorded_at: new Date().toISOString(),
      },
    ],
    updated_at: new Date().toISOString(),
  }));
  if (stage === "confirmed") {
    syncSalesDemoDealOnConfirm(current);
  }
  return current;
}
