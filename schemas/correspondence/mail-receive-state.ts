import { z } from "zod";

export const mailReceiveStateSchema = z.object({
  version: z.literal(1).default(1),
  provider: z.enum(["imap", "gmail_api"]).default("imap"),
  mailbox: z.string().default("INBOX"),
  last_uid: z.number().int().nonnegative().default(0),
  last_sync_at: z.string().optional(),
  last_sync_count: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
});

export type MailReceiveState = z.output<typeof mailReceiveStateSchema>;
