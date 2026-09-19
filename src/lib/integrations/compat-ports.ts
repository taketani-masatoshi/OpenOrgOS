/**
 * Compat egress ports. They wrap existing connectors; they do not become SoT.
 * Path: src/lib/integrations/compat-ports.ts
 */
import { sendConsoleSlackMessage } from "./slack-connector.js";
import type { ChatPort, FilesPort, MailPort, PortResult } from "./ports.js";

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

export function gmailMailPort(): MailPort {
  return {
    provider: "gmail",
    async ping(): Promise<PortResult> {
      return {
        ok: false,
        reason: "Gmail は互換出口です。送信は承認済み下書きの mail send だけです。",
      };
    },
  };
}

export function m365MailPort(): MailPort {
  return {
    provider: "m365",
    async ping(): Promise<PortResult> {
      return { ok: false, reason: M365_STUB };
    },
  };
}
