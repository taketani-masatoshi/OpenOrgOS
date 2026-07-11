import { z } from "zod";

export const gmailOAuthClientSchema = z.object({
  version: z.literal(1).default(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

export type GmailOAuthClient = z.output<typeof gmailOAuthClientSchema>;
