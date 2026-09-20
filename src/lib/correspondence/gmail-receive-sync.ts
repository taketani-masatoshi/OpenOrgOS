/**
 * Gmail receive sync — vault write after MailPort fetch.
 * Path: src/lib/correspondence/gmail-receive-sync.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { MailReceiveSyncResult } from "./mail-receive-sync.js";
import { currentDate } from "../utils.js";
import { getMailReceivedDir } from "./paths.js";
import { loadMailReceiveState, saveMailReceiveState } from "./mail-receive-state.js";
import { loadMailConfig } from "./mail-config.js";
import { gmailMailPort } from "../integrations/compat-ports.js";
import {
  createGmailApiClient,
  type GmailApiClient,
  type GmailFetchMessage,
} from "../integrations/compat/gmail-api.js";

export type { GmailApiClient, GmailFetchMessage };
export { createGmailApiClient };

function buildMessageFilename(msg: { id: string }): string {
  const day = currentDate().replace(/-/g, "");
  const hash = createHash("sha256").update(msg.id).digest("hex").slice(0, 8);
  return `MSG-${day}-${hash}.eml`;
}

/** Gmail API adapter — fetch INBOX via compat MailPort, write vault locally. */
export async function syncGmailReceive(opts?: {
  dryRun?: boolean;
  client?: GmailApiClient;
}): Promise<MailReceiveSyncResult> {
  const config = loadMailConfig();
  const state = loadMailReceiveState();
  const label = config?.receive?.gmail_label ?? "INBOX";
  const port = gmailMailPort(opts?.client ? { client: opts.client } : {});
  const fetched = await port.fetchSince({
    since: state.last_sync_at,
    label,
    dryRun: opts?.dryRun,
  });

  if (!fetched.ok) {
    return {
      mode: "gmail_api",
      fetched: 0,
      saved: [],
      last_uid: state.last_uid,
      message: fetched.reason,
    };
  }

  if (opts?.dryRun) {
    return {
      mode: "gmail_api",
      fetched: fetched.fetched ?? 0,
      saved: [],
      last_uid: state.last_uid,
    };
  }

  const saved: string[] = [];
  let maxUid = state.last_uid;
  const receivedDir = getMailReceivedDir();
  mkdirSync(receivedDir, { recursive: true });

  for (const msg of fetched.messages ?? []) {
    maxUid += 1;
    const filename = buildMessageFilename(msg);
    writeFileSync(join(receivedDir, filename), msg.mime, "utf-8");
    if (msg.threadId) {
      writeFileSync(
        join(receivedDir, `${filename}.meta.json`),
        JSON.stringify({ gmail_thread_id: msg.threadId, gmail_message_id: msg.id }),
        "utf-8",
      );
    }
    saved.push(filename);
  }

  saveMailReceiveState({
    version: 1,
    provider: "gmail_api",
    mailbox: label,
    last_uid: maxUid,
    last_sync_at: new Date().toISOString(),
    last_sync_count: fetched.fetched ?? saved.length,
    last_error: undefined,
  });

  return {
    mode: "gmail_api",
    fetched: fetched.fetched ?? saved.length,
    saved,
    last_uid: maxUid,
  };
}
