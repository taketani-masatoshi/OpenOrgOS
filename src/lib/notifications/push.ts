import { notificationsRegistrySchema, type NotificationsRegistry } from "../../../schemas/steward-chat.js";
import { NOTIFICATIONS_REGISTRY_PATH } from "../steward-paths.js";
import { loadRegistryFile } from "../utils.js";
import { sendWebhook } from "../webhook.js";
import type { TodayContext } from "../../../schemas/steward-chat.js";
import { buildTodaySummaryForPush } from "../steward-chat/today-context.js";
import { getTenantId } from "../tenant.js";
import { pushQueueEvent } from "../queue-db.js";

export function notificationsRegistryPath(): string {
  return process.env.ORGOS_NOTIFICATIONS_REGISTRY?.trim() || NOTIFICATIONS_REGISTRY_PATH;
}

export function loadNotificationsRegistry(): NotificationsRegistry {
  return loadRegistryFile(notificationsRegistryPath(), notificationsRegistrySchema, () =>
    notificationsRegistrySchema.parse({ version: "1" })
  );
}

export interface PushNotificationResult {
  event: string;
  sent: Array<{ channel: string; ok: boolean; detail: string }>;
}

export async function pushNotifications(
  event: string,
  ctx: TodayContext,
  /** Event-specific fields (L1 only) merged into the payload, e.g. mail_triage subjects. */
  extra?: Record<string, unknown>
): Promise<PushNotificationResult> {
  const registry = loadNotificationsRegistry();
  const sent: PushNotificationResult["sent"] = [];
  const payload = {
    ...extra,
    event,
    tenant: getTenantId(),
    report_date: ctx.report_date,
    company_name: ctx.company_name,
    summary: buildTodaySummaryForPush(ctx),
    decisions: ctx.decisions,
    approvals_count: ctx.approvals.length,
    inbox_count: ctx.inbox_pending.length,
    dashboard_path: ctx.dashboard_path,
    executive_summary_path: ctx.executive_summary_path,
  };

  pushQueueEvent({
    type: "pipeline_daily_complete",
    ref: ctx.report_date,
    payload,
    status: "done",
  });

  const webhook = registry.channels?.webhook;
  if (webhook?.url && (!webhook.events.length || webhook.events.includes(event))) {
    const prevUrl = process.env.STEWARD_WEBHOOK_URL;
    try {
      // Reuse sendWebhook via registry outbound — extend with direct fetch if url set in notifications
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhook.secret ? { "X-Steward-Secret": webhook.secret } : {}),
        },
        body: JSON.stringify(payload),
      });
      sent.push({ channel: "webhook", ok: res.ok, detail: res.ok ? "ok" : `HTTP ${res.status}` });
    } catch (err) {
      sent.push({
        channel: "webhook",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      void prevUrl;
    }
  } else {
    const fallback = await sendWebhook(event, payload);
    if (fallback.sent) {
      sent.push({ channel: "webhook-fallback", ok: true, detail: fallback.reason });
    }
  }

  const ow = registry.channels?.openwebui;
  if (ow?.ingest_url && (!ow.events.length || ow.events.includes(event))) {
    try {
      const res = await fetch(ow.ingest_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: payload.summary, metadata: payload }),
      });
      sent.push({ channel: "openwebui", ok: res.ok, detail: res.ok ? "ok" : `HTTP ${res.status}` });
    } catch (err) {
      sent.push({
        channel: "openwebui",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { event, sent };
}
