import { z } from "zod";

export const webhookRegistrySchema = z.object({
  version: z.string(),
  outbound: z
    .object({
      url: z.string().url().optional(),
      secret: z.string().optional(),
      events: z.array(z.string()).default(["work_order_complete", "merge_complete"]),
      format: z.enum(["legacy", "envelope", "dual"]).default("legacy"),
    })
    .optional(),
  inbound: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().default("/steward/webhook"),
      host: z.string().default("127.0.0.1"),
      port: z.number().int().default(9473),
      /** Reject protocol envelopes when signature/attestation verification fails. */
      strict_verification: z.boolean().default(true),
    })
    .optional(),
});

export type WebhookRegistry = z.output<typeof webhookRegistrySchema>;
