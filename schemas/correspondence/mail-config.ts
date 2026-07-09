import { z } from "zod";

export const mailProviderSchema = z.enum(["smtp", "gmail_api", "dry_run"]);

export const mailConfigSchema = z.object({
  provider: mailProviderSchema.default("dry_run"),
  from: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  smtp: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().default(587),
      secure: z.boolean().default(false),
    })
    .optional(),
  inbox: z
    .object({
      sync: z.enum(["stub", "imap", "gmail_api"]).default("stub"),
      imap_host: z.string().optional(),
      imap_port: z.number().int().positive().optional(),
      gmail_label: z.string().optional(),
    })
    .default({ sync: "stub" }),
  notes: z.string().optional(),
});

export type MailConfig = z.output<typeof mailConfigSchema>;
