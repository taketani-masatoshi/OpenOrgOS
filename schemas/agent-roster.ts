import { z } from "zod";
import { agentId } from "./classification.js";

export const tenantAgentRosterSchema = z.object({
  version: z.number().int().default(1),
  profiles: z
    .object({
      operational: z.array(agentId).default([]),
      developer: z.array(agentId).default([]),
    })
    .default({}),
  disabled: z.array(agentId).default([]),
});

export type TenantAgentRoster = z.output<typeof tenantAgentRosterSchema>;
