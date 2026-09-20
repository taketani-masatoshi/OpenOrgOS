/**
 * Compat egress ports. They wrap existing connectors; they do not become SoT.
 * Path: src/lib/integrations/compat-ports.ts
 */
import { resolveGmailAccessToken } from "../correspondence/gmail-oauth.js";
import { sendConsoleSlackMessage } from "./slack-connector.js";
import {
  createGmailApiClient,
  sendGmailRawMime,
  type GmailApiClient,
} from "./compat/gmail-api.js";
import type {
  ChatPort,
  FilesPort,
  MailFetchResult,
  MailPort,
  MailSendResult,
  PortResult,
} from "./ports.js";

const M365_STUB = "Microsoft 365 は互換出口のスタブです。出荷後に接続できます。外へは出しません";

export function slackChatPort(fetchImpl: typeof fetch = fetch): ChatPort {
  return {
    provider: "slack",
    async send(input) {
      const result = await sendConsoleSlackMessage(
        { text: input.text, channel: input.roomId, dryRun: input.dryRun },
        fetchImpl,
      );
      return {
        ok: result.sent || result.dryRun === true,
        dryRun: result.dryRun,
        reason: result.reason,
      };
    },
  };
}

export function gdriveFilesPort(): FilesPort {
  return {
    provider: "gdrive",
    async put(): Promise<PortResult> {
      return {
        ok: false,
        reason: "Google Drive は許可リスト内の PDF 写しだけです。orgos integrations gdrive export を使ってください。",
      };
    },
  };
}

export interface GmailMailPortDeps {
  client?: GmailApiClient;
  resolveToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

/** Compat MailPort — wraps Gmail API. Approval stays in send-gate. */
export function gmailMailPort(deps: GmailMailPortDeps = {}): MailPort {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveToken = deps.resolveToken ?? resolveGmailAccessToken;

  return {
    provider: "gmail",
    async ping(): Promise<PortResult> {
      const token = await resolveToken();
      if (!token) {
        return {
          ok: false,
          reason: "Gmail API token missing — run orgos mail setup gmail",
        };
      }
      return { ok: true, reason: "ok" };
    },

    async fetchSince(input = {}): Promise<MailFetchResult> {
      const token = deps.client ? "injected" : await resolveToken();
      if (!token && !deps.client) {
        return {
          ok: false,
          reason: "Gmail API not configured — place OAuth token at records/executive/gmail-oauth.json",
          messages: [],
          fetched: 0,
        };
      }
      const client =
        deps.client ?? createGmailApiClient(await resolveToken() as string, fetchImpl);
      const label = input.label ?? "INBOX";
      const afterMs = input.since ? new Date(input.since).getTime() : undefined;
      const ids = await client.listMessageIds({
        labelIds: [label],
        afterInternalDate: Number.isFinite(afterMs) ? afterMs : undefined,
      });
      if (input.dryRun) {
        return { ok: true, reason: "ok", dryRun: true, messages: [], fetched: ids.length };
      }
      const messages = [];
      for (const id of ids) {
        const msg = await client.getMessageRaw(id);
        if (!msg) continue;
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          internalDate: msg.internalDate,
          mime: msg.raw,
        });
      }
      return { ok: true, reason: "ok", messages, fetched: ids.length };
    },

    async sendMime(input): Promise<MailSendResult> {
      if (input.dryRun) {
        return { ok: true, reason: "ok", dryRun: true, messageId: "dry-run@gmail" };
      }
      const sent = await sendGmailRawMime(input.mime, fetchImpl, resolveToken);
      if (!sent.ok) return { ok: false, reason: sent.reason };
      return { ok: true, reason: "ok", messageId: sent.messageId };
    },
  };
}

export function m365MailPort(): MailPort {
  return {
    provider: "m365",
    async ping(): Promise<PortResult> {
      return { ok: false, reason: M365_STUB };
    },
    async fetchSince(): Promise<MailFetchResult> {
      return { ok: false, reason: M365_STUB, messages: [], fetched: 0 };
    },
    async sendMime(): Promise<MailSendResult> {
      return { ok: false, reason: M365_STUB };
    },
  };
}
