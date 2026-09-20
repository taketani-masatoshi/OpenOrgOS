/**
 * Generic SMTP send as a MailPort. Not Xserver-specific. Receive stays on IMAP.
 * Path: src/lib/integrations/compat/smtp-mail-port.ts
 */
import type { MailFetchResult, MailPort, MailSendResult } from "../ports.js";

export function smtpMailPort(
  deliver: (mime: string) => Promise<{ messageId?: string }>,
): MailPort {
  return {
    provider: "smtp",
    async ping() {
      return { ok: true, reason: "smtp" };
    },
    async fetchSince(): Promise<MailFetchResult> {
      return {
        ok: false,
        reason: "SMTP は送信専用です。受信は IMAP です。",
        messages: [],
        fetched: 0,
      };
    },
    async sendMime(input): Promise<MailSendResult> {
      if (input.dryRun) return { ok: true, dryRun: true, reason: "ok" };
      if (!input.mime.trim()) return { ok: false, reason: "empty mime" };
      const sent = await deliver(input.mime);
      return { ok: true, reason: "ok", messageId: sent.messageId };
    },
  };
}
