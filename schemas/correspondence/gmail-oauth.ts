import { z } from "zod";

export const gmailOAuthTokenSchema = z.object({
  version: z.literal(1).default(1),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().default("Bearer"),
  expiry_date: z.number().int().optional(),
  scope: z.string().optional(),
  email: z.string().email().optional(),
  connected_via: z.enum(["cli", "community"]).optional(),
});

export type GmailOAuthToken = z.output<typeof gmailOAuthTokenSchema>;
