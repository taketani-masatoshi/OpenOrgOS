import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { currentDate } from "../utils.js";
import { resolveImapCredentials } from "./imap-credentials.js";
import { loadMailConfig, resolveMailConfig } from "./mail-config.js";
import { loadMailReceiveState, saveMailReceiveState } from "./mail-receive-state.js";
import { getMailReceivedDir } from "./paths.js";

export interface FetchedMailMessage {
  uid: number;
  messageId: string;
  from: string;
  subject: string;
  receivedAt: string;
  raw: string;
}

export interface MailReceiveSyncResult {
  mode: "stub" | "imap" | "gmail_api" | "skipped";
  fetched: number;
  saved: string[];
  last_uid: number;
  message?: string;
}

export interface MailReceiveFetcher {
  fetchSinceUid(opts: {
    host: string;
    port: number;
    secure: boolean;
    mailbox: string;
    user: string;
    pass: string;
    sinceUid: number;
  }): Promise<FetchedMailMessage[]>;
}

function buildMessageId(msg: FetchedMailMessage): string {
  const day = currentDate().replace(/-/g, "");
  const hash = createHash("sha256")
    .update(msg.messageId || `${msg.uid}:${msg.subject}:${msg.from}`)
    .digest("hex")
    .slice(0, 8);
  return `MSG-${day}-${hash}`;
}

function resolveImapEndpoint(config: MailConfig): { host: string; port: number; secure: boolean } {
  const creds = resolveImapCredentials();
  const host =
    config.receive?.imap_host ||
    creds?.host ||
    config.smtp?.host?.replace(/^smtp\./, "imap.") ||
    "";
  const port = config.receive?.imap_port ?? creds?.port ?? 993;
  const secure = port === 993;
  return { host, port, secure };
}

export async function syncMailReceive(opts?: {
  fetcher?: MailReceiveFetcher;
  dryRun?: boolean;
}): Promise<MailReceiveSyncResult> {
  const config = loadMailConfig() ?? resolveMailConfig();
  const syncMode = config.receive?.sync ?? "stub";

  if (syncMode === "stub") {
    return {
      mode: "stub",
      fetched: 0,
      saved: [],
      last_uid: loadMailReceiveState().last_uid,
      message: "receive.sync is stub — configure imap in mail-config.yaml",
    };
  }

  if (syncMode === "gmail_api") {
    const { syncGmailReceive } = await import("./gmail-receive-sync.js");
    return syncGmailReceive(opts);
  }

  const creds = resolveImapCredentials();
  if (!creds) {
    return {
      mode: "imap",
      fetched: 0,
      saved: [],
      last_uid: loadMailReceiveState().last_uid,
      message: "IMAP credentials missing — set ORGOS_IMAP_USER/PASSWORD or ORGOS_SMTP_*",
    };
  }

  const endpoint = resolveImapEndpoint(config);
  if (!endpoint.host) {
    return {
      mode: "imap",
      fetched: 0,
      saved: [],
      last_uid: loadMailReceiveState().last_uid,
      message: "IMAP host missing — set receive.imap_host in mail-config.yaml",
    };
  }

  const state = loadMailReceiveState();
  const mailbox = config.receive?.imap_mailbox ?? state.mailbox ?? "INBOX";
  const fetcher = opts?.fetcher ?? (await import("./imap-fetcher.js")).createImapFetcher();

  try {
    const messages = await fetcher.fetchSinceUid({
      host: endpoint.host,
      port: endpoint.port,
      secure: endpoint.secure,
      mailbox,
      user: creds.user,
      pass: creds.pass,
      sinceUid: state.last_uid,
    });

    const saved: string[] = [];
    let maxUid = state.last_uid;
    const receivedDir = getMailReceivedDir();
    if (!opts?.dryRun) mkdirSync(receivedDir, { recursive: true });

    for (const msg of messages) {
      maxUid = Math.max(maxUid, msg.uid);
      if (opts?.dryRun) continue;
      const id = buildMessageId(msg);
      const filename = `${id}.eml`;
      writeFileSync(join(receivedDir, filename), msg.raw, "utf-8");
      saved.push(filename);
    }

    if (!opts?.dryRun) {
      saveMailReceiveState({
        version: 1,
        provider: "imap",
        mailbox,
        last_uid: maxUid,
        last_sync_at: new Date().toISOString(),
        last_sync_count: messages.length,
        last_error: undefined,
      });
    }

    return {
      mode: "imap",
      fetched: messages.length,
      saved,
      last_uid: maxUid,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!opts?.dryRun) {
      saveMailReceiveState({
        ...state,
        last_error: message,
        last_sync_at: new Date().toISOString(),
      });
    }
    throw err;
  }
}

export function listUnqueuedEmlFiles(queuedRefs: Set<string>): string[] {
  const dir = getMailReceivedDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".eml"))
    .filter((name) => !queuedRefs.has(`records/executive/mail-received/${name}`));
}
