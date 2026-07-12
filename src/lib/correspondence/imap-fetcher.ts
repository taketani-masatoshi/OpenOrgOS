import { ImapFlow } from "imapflow";
import type { FetchedMailMessage, MailReceiveFetcher } from "./mail-receive-sync.js";

export function createImapFetcher(): MailReceiveFetcher {
  return {
    async fetchSinceUid(opts) {
      const client = new ImapFlow({
        host: opts.host,
        port: opts.port,
        secure: opts.secure,
        auth: { user: opts.user, pass: opts.pass },
        logger: false,
      });

      const messages: FetchedMailMessage[] = [];

      await client.connect();
      try {
        const lock = await client.getMailboxLock(opts.mailbox);
        try {
          const range = opts.sinceUid > 0 ? `${opts.sinceUid + 1}:*` : "1:*";
          for await (const msg of client.fetch(range, {
            uid: true,
            envelope: true,
            source: true,
          })) {
            if (!msg.uid || msg.uid <= opts.sinceUid) continue;
            const envelope = msg.envelope;
            const fromAddr = envelope?.from?.[0];
            const from = fromAddr
              ? `${fromAddr.name ? `${fromAddr.name} ` : ""}<${fromAddr.address}>`
              : "unknown";
            const subject = envelope?.subject ?? "(no subject)";
            const messageId = envelope?.messageId ?? `uid:${msg.uid}`;
            const receivedAt = envelope?.date?.toISOString() ?? new Date().toISOString();
            const raw = msg.source?.toString("utf-8") ?? "";
            messages.push({
              uid: msg.uid,
              messageId,
              from,
              subject,
              receivedAt,
              raw,
            });
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }

      return messages.sort((a, b) => a.uid - b.uid);
    },
  };
}
