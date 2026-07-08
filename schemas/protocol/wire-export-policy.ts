import { z } from "zod";

/** Pull export policy — Core side (WG-2 implements enforcement). */
export const wireExportPolicySchema = z.object({
  version: z.literal("1").default("1"),
  /** Default when peer-specific rule missing. */
  default_allowed: z.boolean().default(false),
  rules: z
    .array(
      z.object({
        peer_node_id: z.string().min(1),
        allowed: z.boolean().default(true),
        /** Optional event type allowlist; empty = all approved outbox. */
        event_types: z.array(z.string()).optional(),
        notes: z.string().optional(),
      })
    )
    .default([]),
});

export type WireExportPolicy = z.output<typeof wireExportPolicySchema>;
