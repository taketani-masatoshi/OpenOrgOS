import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { MailReceiveSyncResult } from "./mail-receive-sync.js";
import { currentDate } from "../utils.js";
import { getMailReceivedDir } from "./paths.js";
import { loadMailReceiveState, saveMailReceiveState } from "./mail-receive-state.js";
import { loadMailConfig } from "./mail-config.js";
import { resolveGmailAccessToken } from "./gmail-oauth.js";

export interface GmailFetchMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  raw: string;
}

export interface GmailApiClient {
  listMessageIds(opts: { labelIds?: string[]; afterInternalDate?: number }): Promise<string[]>;
  getMessageRaw(id: string): Promise<GmailFetchMessage | null>;
}

function buildMessageFilename(msg: GmailFetchMessage): string {
  const day = currentDate().replace(/-/g, "");
  const hash = createHash("sha256").update(msg.id).digest("hex").slice(0, 8);
  return `MSG-${day}-${hash}.eml`;
}

export function createGmailApiClient(accessToken: string): GmailApiClient {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";

  return {
    async listMessageIds(opts) {
      const params = new URLSearchParams({ maxResults: "50" });
      for (const label of opts.labelIds ?? ["INBOX"]) {
        params.append("labelIds", label);
      }
      if (opts.afterInternalDate != null) {
        params.set("q", `after:${Math.floor(opts.afterInternalDate / 1000)}`);
      }
      const res = await fetch(`${base}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { messages?: Array<{ id: string }> };
      return (body.messages ?? []).map((m) => m.id);
    },

    async getMessageRaw(id) {
      const res = await fetch(`${base}/messages/${id}?format=raw`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        id: string;
        threadId?: string;
        internalDate?: string;
        raw?: string;
      };
      if (!body.raw) return null;
      const raw = Buffer.from(body.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf-8"
      );
      return {
        id: body.id,
        threadId: body.threadId,
        internalDate: body.internalDate,
        raw,
      };
    },
  };
}

/** Gmail API adapter — fetch INBOX via REST API */
export async function syncGmailReceive(opts?: {
  dryRun?: boolean;
  client?: GmailApiClient;
}): Promise<MailReceiveSyncResult> {
  const accessToken = await resolveGmailAccessToken();
  if (!accessToken) {
    return {
      mode: "gmail_api",
      fetched: 0,
      saved: [],
      last_uid: loadMailReceiveState().last_uid,
      message: "Gmail API not configured — place OAuth token at records/executive/gmail-oauth.json",
    };
  }

  const config = loadMailConfig();
  const state = loadMailReceiveState();
  const client = opts?.client ?? createGmailApiClient(accessToken);
  const label = config?.receive?.gmail_label ?? "INBOX";
  const afterMs = state.last_sync_at ? new Date(state.last_sync_at).getTime() : undefined;

  const ids = await client.listMessageIds({
    labelIds: [label],
    afterInternalDate: afterMs,
  });

  const saved: string[] = [];
  let maxUid = state.last_uid;
  const receivedDir = getMailReceivedDir();
  if (!opts?.dryRun) mkdirSync(receivedDir, { recursive: true });

  for (const id of ids) {
    const msg = await client.getMessageRaw(id);
    if (!msg) continue;
    maxUid += 1;
    if (opts?.dryRun) continue;
    const filename = buildMessageFilename(msg);
    writeFileSync(join(receivedDir, filename), msg.raw, "utf-8");
    saved.push(filename);
  }

  if (!opts?.dryRun) {
    saveMailReceiveState({
      version: 1,
      provider: "gmail_api",
      mailbox: label,
      last_uid: maxUid,
      last_sync_at: new Date().toISOString(),
      last_sync_count: ids.length,
      last_error: undefined,
    });
  }

  return {
    mode: "gmail_api",
    fetched: ids.length,
    saved,
    last_uid: maxUid,
  };
}
