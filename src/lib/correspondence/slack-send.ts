import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { sendConsoleSlackMessage } from "../integrations/slack-connector.js";

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

  const outcome = await sendConsoleSlackMessage({
    text: draft.body,
    channel: draft.slack_channel,
    dryRun: opts?.dryRun,
  });

  return {
    sent: outcome.sent,
    reason: outcome.reason,
    ...(outcome.dryRun ? { dryRun: true } : {}),
  };
}
