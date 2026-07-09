import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { resolveSlackWebhookUrl } from "./mail-config.js";

export interface SlackSendResult {
  sent: boolean;
  reason: string;
  dryRun?: boolean;
}

export async function sendSlackNotification(
  draft: CorrespondenceDraft,
  opts?: { dryRun?: boolean }
): Promise<SlackSendResult> {
  if (draft.channel !== "slack") {
    throw new Error(`Draft ${draft.draft_id} is not a slack channel`);
  }

  const webhookUrl = resolveSlackWebhookUrl();
  if (!webhookUrl) {
    if (opts?.dryRun) {
      return { sent: false, reason: "dry_run — no ORGOS_SLACK_WEBHOOK_URL", dryRun: true };
    }
    return {
      sent: false,
      reason: "ORGOS_SLACK_WEBHOOK_URL not set (L2 — env or records/)",
    };
  }

  if (opts?.dryRun) {
    return { sent: false, reason: "dry_run — webhook configured", dryRun: true };
  }

  const channel = draft.slack_channel ? `#${draft.slack_channel.replace(/^#/, "")}` : undefined;
  const payload: Record<string, unknown> = {
    text: draft.body,
  };
  if (channel) payload.channel = channel;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    return { sent: false, reason: `HTTP ${res.status}` };
  }
  return { sent: true, reason: "ok" };
}
