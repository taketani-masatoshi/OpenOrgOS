import { z } from "zod";

export const protocolRegistrySchema = z.object({
  protocol_version: z.literal("1"),
  core_event_types: z.array(z.string()).min(1),
  payload_namespaces: z.array(z.string()).default([]),
  outbound: z
    .object({
      format: z.enum(["legacy", "envelope", "dual"]).default("legacy"),
    })
    .optional(),
});

export type ProtocolRegistry = z.output<typeof protocolRegistrySchema>;
