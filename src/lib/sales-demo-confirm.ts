/**
 * When a sales_demo scheduling case is confirmed, update the linked deal.
 */
import type { SchedulingCase } from "../../schemas/executive/scheduling-cases.js";
import { findDeal, upsertDeal } from "./sales-deal-service.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function syncSalesDemoDealOnConfirm(caseRow: SchedulingCase): void {
  if (caseRow.kind !== "sales_demo" || !caseRow.deal_id) return;
  const deal = findDeal(caseRow.deal_id);
  if (!deal) return;

  upsertDeal({
    ...deal,
    scheduling_case_id: caseRow.id,
    next_action: "デモ実施 · フォローアップ",
    next_action_due: addDays(currentDate(), 2),
  });

  appendAuditEvent({
    event: "sales_demo",
    ref: caseRow.id,
    detail: `confirmed:${caseRow.deal_id}`,
  });
}
