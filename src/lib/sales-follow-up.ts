/**
 * Follow-up next_action from sent correspondence drafts.
 */
import { listCorrespondenceDrafts } from "./correspondence/draft.js";
import { setDealNextAction, findDeal } from "./sales-deal-service.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

const FOLLOW_UP_DAYS = 3;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface FollowUpFromSentResult {
  deal_id: string;
  draft_id: string;
  next_action: string;
  next_action_due: string;
  dry_run: boolean;
}

export function followUpFromSent(opts: {
  dealId: string;
  confirm: boolean;
  actor?: string;
  dryRun?: boolean;
}): FollowUpFromSentResult {
  if (!opts.confirm) {
    throw new Error("follow-up-from-sent requires --confirm");
  }
  const deal = findDeal(opts.dealId);
  if (!deal) throw new Error(`deal not found: ${opts.dealId}`);

  const drafts = listCorrespondenceDrafts({ status: "sent", channel: "email" });
  const draft = drafts.find((d) => d.deal_id === opts.dealId);
  if (!draft) {
    throw new Error(`no sent correspondence draft for deal ${opts.dealId}`);
  }

  const due = addDays(currentDate(), FOLLOW_UP_DAYS);
  const next_action = "フォローアップ";

  if (!opts.dryRun) {
    setDealNextAction({
      dealId: opts.dealId,
      next_action,
      next_action_due: due,
      actor: { operator_id: opts.actor },
    });
    appendAuditEvent({
      event: "sales_stage_change",
      ref: opts.dealId,
      actor: opts.actor,
      detail: `follow_up_from:${draft.draft_id}`,
    });
  }

  return {
    deal_id: opts.dealId,
    draft_id: draft.draft_id,
    next_action,
    next_action_due: due,
    dry_run: Boolean(opts.dryRun),
  };
}
