import { z } from "zod";
import { agentId } from "./classification.js";

export const dispatchTowerRegistrySchema = z.object({
  version: z.string(),
  judgment_patterns: z
    .array(z.object({ pattern: z.string().min(1) }))
    .default([]),
  human_act_patterns: z
    .array(
      z.object({
        pattern: z.string().min(1),
        required_tags: z.array(z.string()).default([]),
      })
    )
    .default([]),
  aia_draft_patterns: z
    .array(
      z.object({
        pattern: z.string().min(1),
        owner_agent: agentId.optional(),
      })
    )
    .default([]),
  fact_gap_tags: z
    .record(
      z.string(),
      z.object({
        tags: z.array(z.string()).default([]),
        blocked_on: z.string().optional(),
      })
    )
    .default({}),
  cashflow_gap: z
    .object({
      blocked_on: z.string().optional(),
      tags: z.array(z.string()).default([]),
    })
    .optional(),
});

export type DispatchTowerRegistry = z.output<typeof dispatchTowerRegistrySchema>;
