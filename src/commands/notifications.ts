import { buildTodayContext } from "../lib/steward-chat/today-context.js";
import { pushNotifications } from "../lib/notifications/push.js";
import { buildTodaySummaryForPush } from "../lib/steward-chat/today-context.js";

export interface NotificationsTestOptions {
  dryRun?: boolean;
  event?: string;
}

export async function runNotificationsTest(opts: NotificationsTestOptions = {}): Promise<void> {
  const event = opts.event ?? "pipeline_daily_complete";
  const ctx = buildTodayContext();
  const payload = {
    event,
    tenant: ctx.tenant,
    report_date: ctx.report_date,
    company_name: ctx.company_name,
    summary: buildTodaySummaryForPush(ctx),
    decisions: ctx.decisions,
    approvals_count: ctx.approvals.length,
    inbox_count: ctx.inbox_pending.length,
  };

  if (opts.dryRun) {
    console.log("Notifications test (dry-run)\n");
    console.log(JSON.stringify(payload, null, 2));
    console.log("\nRun without --dry-run to POST to configured channels.");
    return;
  }

  console.log(`Notifications test · event=${event} · tenant=${ctx.tenant}\n`);
  const result = await pushNotifications(event, ctx);
  if (result.sent.length === 0) {
    console.log("  (no channels sent — configure steward/platform/notifications/registry.yaml)");
    console.log("  orgos doctor · orgos notifications test --dry-run");
    return;
  }
  for (const s of result.sent) {
    console.log(`  ${s.ok ? "✓" : "✗"} ${s.channel}: ${s.detail}`);
  }
}
