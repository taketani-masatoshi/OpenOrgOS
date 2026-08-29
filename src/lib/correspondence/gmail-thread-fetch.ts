/**
 * Fetch all messages in a Gmail thread and triage new .eml files.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { GmailApiClient, GmailFetchMessage } from "./gmail-receive-sync.js";
import { createGmailApiClient } from "./gmail-receive-sync.js";
import { resolveGmailAccessToken } from "./gmail-oauth.js";
import { getMailReceivedDir } from "./paths.js";
import { currentDate } from "../utils.js";
import { triageEmlFile } from "./mail-triage.js";
import { findTriageEntry, loadMailTriageQueue } from "./mail-triage-queue.js";
import { runSalesMailLinkFromTriage } from "../sales-mail-link.js";

export interface GmailThreadMessageSummary {
  gmail_message_id: string;
  filename?: string;
  subject?: string;
  received_at?: string;
  from?: string;
}

export interface GmailThreadFetchResult {
  thread_id: string;
  fetched: number;
  saved: string[];
  summaries: GmailThreadMessageSummary[];
}

function buildMessageFilenameFromGmailId(gmailId: string): string {
  const day = currentDate().replace(/-/g, "");
  const hash = createHash("sha256").update(gmailId).digest("hex").slice(0, 8);
  return `MSG-${day}-${hash}.eml`;
}

function findExistingFilenameForGmailId(gmailId: string): string | undefined {
  const dir = getMailReceivedDir();
  if (!existsSync(dir)) return undefined;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".eml")) continue;
    const metaPath = join(dir, `${name}.meta.json`);
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
        gmail_message_id?: string;
      };
      if (meta.gmail_message_id === gmailId) return name;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

async function saveGmailMessage(
  msg: GmailFetchMessage,
  receivedDir: string,
): Promise<string | undefined> {
  const existing = findExistingFilenameForGmailId(msg.id);
  if (existing) return existing;

  const filename = buildMessageFilenameFromGmailId(msg.id);
  writeFileSync(join(receivedDir, filename), msg.raw, "utf-8");
  if (msg.threadId) {
    writeFileSync(
      join(receivedDir, `${filename}.meta.json`),
      JSON.stringify({ gmail_thread_id: msg.threadId, gmail_message_id: msg.id }),
      "utf-8",
    );
  }
  return filename;
}

function summarizeEml(filename: string): Omit<GmailThreadMessageSummary, "gmail_message_id"> {
  const emlPath = join(getMailReceivedDir(), filename);
  if (!existsSync(emlPath)) return {};
  const raw = readFileSync(emlPath, "utf-8");
  const subject = raw.match(/^Subject:\s*(.+)$/im)?.[1]?.trim();
  const from = raw.match(/^From:\s*(.+)$/im)?.[1]?.trim();
  const date = raw.match(/^Date:\s*(.+)$/im)?.[1]?.trim();
  return { filename, subject, from, received_at: date };
}

async function listThreadMessageIds(
  client: GmailApiClient,
  threadId: string,
): Promise<string[]> {
  if (client.getThreadMessageIds) {
    return client.getThreadMessageIds(threadId);
  }
  return [];
}

/** Fetch all messages in a Gmail thread and triage new .eml files. */
export async function fetchGmailThreadHistory(opts: {
  threadId: string;
  client?: GmailApiClient;
  dryRun?: boolean;
  autoLink?: boolean;
}): Promise<GmailThreadFetchResult> {
  const accessToken = await resolveGmailAccessToken();
  if (!accessToken && !opts.client) {
    throw new Error("Gmail API not configured");
  }
  const client = opts.client ?? createGmailApiClient(accessToken!);
  const messageIds = await listThreadMessageIds(client, opts.threadId);

  const receivedDir = getMailReceivedDir();
  if (!opts.dryRun) mkdirSync(receivedDir, { recursive: true });

  const saved: string[] = [];
  const summaries: GmailThreadMessageSummary[] = [];

  for (const id of messageIds) {
    const existing = findExistingFilenameForGmailId(id);
    if (existing) {
      summaries.push({
        gmail_message_id: id,
        ...summarizeEml(existing),
      });
      continue;
    }
    if (opts.dryRun) {
      summaries.push({ gmail_message_id: id });
      continue;
    }
    const msg = await client.getMessageRaw(id);
    if (!msg) continue;
    const filename = await saveGmailMessage(
      { ...msg, threadId: opts.threadId },
      receivedDir,
    );
    if (!filename) continue;
    saved.push(filename);
    await triageEmlFile(filename, { identifySender: false });
    summaries.push({
      gmail_message_id: id,
      ...summarizeEml(filename),
    });
  }

  if (!opts.dryRun && opts.autoLink !== false) {
    runSalesMailLinkFromTriage();
  }

  return {
    thread_id: opts.threadId,
    fetched: messageIds.length,
    saved,
    summaries,
  };
}

/** Resolve thread id from triage entry id or gmail thread id. */
export function resolveGmailThreadId(ref: string): string | undefined {
  const entry = findTriageEntry(ref);
  if (entry?.gmail_thread_id) return entry.gmail_thread_id;
  if (/^[a-f0-9]+$/i.test(ref) && ref.length >= 8) return ref;
  const queue = loadMailTriageQueue();
  const byGmail = queue.entries.find((e) => e.gmail_thread_id === ref);
  return byGmail?.gmail_thread_id;
}

export function listTriageEntriesForGmailThread(threadId: string) {
  return loadMailTriageQueue().entries.filter((e) => e.gmail_thread_id === threadId);
}
