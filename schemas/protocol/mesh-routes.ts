import { z } from "zod";

export const meshRouteSchema = z.object({
  destination_peer_id: z.string().regex(/^PEER-\d{3}$/),
  via: z.array(z.string().regex(/^PEER-\d{3}$/)).default([]),
  notes: z.string().optional(),
});

export const meshRoutesRegistrySchema = z.object({
  as_of: z.string().optional(),
  routes: z.array(meshRouteSchema).default([]),
});

export type MeshRoute = z.output<typeof meshRouteSchema>;
export type MeshRoutesRegistry = z.output<typeof meshRoutesRegistrySchema>;
