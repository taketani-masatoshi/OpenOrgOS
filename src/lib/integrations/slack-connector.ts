/**
 * Slack connector — bot token first, incoming webhook as fallback.
 * Path: src/lib/integrations/slack-connector.ts
 *
 * Slack is an outbound surface, not a source of truth. Messages carry L0–L1
 * text only; mail bodies, amounts and personal data stay inside OrgOS.
 */
import { loadConnectorSettings, loadConnectorToken } from "./connector-store.js";
import { hydrateConnectorEnvFromStore } from "./connector-secrets-store.js";

const SLACK_API = "https://slack.com/api";

export interface SlackSendOutcome {
  sent: boolean;
  reason: string;
  transport: "bot_token" | "webhook" | "none";
  channel?: string;
  dryRun?: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export function resolveSlackBotToken(): string | undefined {
  const token = loadConnectorToken("slack");
  return token?.access_token;
}

export function resolveSlackWebhook(): string | undefined {
  hydrateConnectorEnvFromStore();
  return process.env.ORGOS_SLACK_WEBHOOK_URL?.trim() || undefined;
}

/** Channel id + name only — Slack membership and history stay in Slack. */
export async function listSlackChannels(
  fetchImpl: typeof fetch = fetch,
): Promise<SlackChannel[]> {
  const token = resolveSlackBotToken();
  if (!token) return [];
  const res = await fetchImpl(
    `${SLACK_API}/conversations.list?limit=200&exclude_archived=true&types=public_channel`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    ok?: boolean;
    channels?: Array<{ id?: string; name?: string }>;
  };
  if (!body.ok) return [];
  return (body.channels ?? [])
    .filter((c): c is { id: string; name: string } => Boolean(c.id && c.name))
    .map((c) => ({ id: c.id, name: c.name }));
}

function resolveChannel(explicit?: string): string | undefined {
  const channel = explicit?.trim() || loadConnectorSettings("slack")?.default_channel_id?.trim();
  return channel || undefined;
}

export interface SlackSendInput {
  text: string;
  channel?: string;
  dryRun?: boolean;
  operatorId?: string;
}

/**
 * Post a message from the Console. The caller is responsible for the approval
 * gate; this function only decides which transport can carry the message.
 */
export async function sendConsoleSlackMessage(
  input: SlackSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SlackSendOutcome> {
  const channel = resolveChannel(input.channel);
  const token = resolveSlackBotToken();
  const webhook = resolveSlackWebhook();

  if (!token && !webhook) {
    return {
      sent: false,
      reason: "Slack が未接続です。連携設定から接続するか webhook を登録してください。",
      transport: "none",
    };
  }

  if (token && !channel) {
    return {
      sent: false,
      reason: "投稿先チャンネルが未設定です。連携設定で既定チャンネルを選んでください。",
      transport: "bot_token",
    };
  }

  if (input.dryRun) {
    return {
      sent: false,
      dryRun: true,
      reason: token ? "dry_run — bot token 経由で送信できます" : "dry_run — webhook 経由で送信できます",
      transport: token ? "bot_token" : "webhook",
      channel,
    };
  }

  if (token && channel) {
    const res = await fetchImpl(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text: input.text }),
    });
    if (!res.ok) {
      return { sent: false, reason: `slack_http_${res.status}`, transport: "bot_token", channel };
    }
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!body.ok) {
      return {
        sent: false,
        reason: `slack_error_${body.error ?? "unknown"}`,
        transport: "bot_token",
        channel,
      };
    }
    return { sent: true, reason: "ok", transport: "bot_token", channel };
  }

  const payload: Record<string, unknown> = { text: input.text };
  if (channel) payload.channel = channel.startsWith("#") ? channel : `#${channel}`;
  const res = await fetchImpl(webhook!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { sent: false, reason: `slack_http_${res.status}`, transport: "webhook", channel };
  }
  return { sent: true, reason: "ok", transport: "webhook", channel };
}
