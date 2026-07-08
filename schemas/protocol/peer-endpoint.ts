import { z } from "zod";

export const peerEndpointModeSchema = z.enum(["push", "relay", "pull"]);

export const peerEndpointSchema = z.object({
  url: z.string().url(),
  priority: z.number().int().positive().default(1),
  mode: peerEndpointModeSchema.default("push"),
});

export type PeerEndpoint = z.output<typeof peerEndpointSchema>;
export type PeerEndpointMode = z.output<typeof peerEndpointModeSchema>;
