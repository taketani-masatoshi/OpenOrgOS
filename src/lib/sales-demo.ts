/**
 * Sales demo scheduling — wraps executive scheduling cases.
 */
import {
  schedulingCaseSchema,
  type SchedulingCase,
} from "../../schemas/executive/scheduling-cases.js";
import { loadSchedulingCases, saveSchedulingCases } from "./scheduling-coordination/store.js";
import { findDeal, upsertDeal } from "./sales-deal-service.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

function nextSchId(cases: SchedulingCase[], year = currentDate().slice(0, 4)): string {
  let max = 0;
  const prefix = `SCH-${year}-`;
  for (const c of cases) {
    if (!c.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(c.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function openSalesDemo(opts: {
  dealId: string;
  participantName: string;
  participantEmail?: string;
  actor?: string;
}): SchedulingCase {
  const deal = findDeal(opts.dealId);
  if (!deal) throw new Error(`deal not found: ${opts.dealId}`);

  const file = loadSchedulingCases();
  const cases = file?.cases ?? [];
  const now = new Date().toISOString();
  const sch: SchedulingCase = schedulingCaseSchema.parse({
    id: nextSchId(cases),
    title: `Demo: ${deal.title}`,
    status: "open",
    created_at: now,
    updated_at: now,
    participants: [
      {
        id: "PART-001",
        name: opts.participantName,
        email: opts.participantEmail,
        role: "external",
        response: "pending",
      },
    ],
    duration_minutes: 60,
    deal_id: opts.dealId,
    kind: "sales_demo",
    next_action: "propose_slots",
    mail_thread_ids: deal.mail_thread_ids ?? [],
  });

  cases.push(sch);
  saveSchedulingCases({ version: 1, cases });

  upsertDeal(
    {
      ...deal,
      scheduling_case_id: sch.id,
      next_action: deal.next_action ?? "デモ日程候補を送付",
    },
    { operator_id: opts.actor },
  );

  appendAuditEvent({
    event: "sales_demo",
    ref: sch.id,
    actor: opts.actor,
    detail: opts.dealId,
  });

  return sch;
}
