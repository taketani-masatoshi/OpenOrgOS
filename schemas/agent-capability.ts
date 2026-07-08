import { z } from "zod";
import { agentId } from "./classification.js";

export const agentPulseCheckSchema = z.object({
  type: z.enum(["path_exists", "file_exists", "cli_hint"]),
  path: z.string().optional(),
  detail: z.string().optional(),
});

export const agentCapabilityEntrySchema = z.object({
  id: agentId,
  summary_slug: z.string().min(1),
  data_paths: z.array(z.string()).default([]),
  docs_paths: z.array(z.string()).default([]),
  route_ids: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  pulse_checks: z.array(agentPulseCheckSchema).default([]),
});

export const agentCapabilityManifestSchema = z.object({
  version: z.string(),
  agents: z.array(agentCapabilityEntrySchema),
});

export type AgentCapabilityEntry = z.output<typeof agentCapabilityEntrySchema>;
export type AgentCapabilityManifest = z.output<typeof agentCapabilityManifestSchema>;

export interface AgentReadinessAxis {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface AgentReadinessResult {
  agent_id: z.output<typeof agentId>;
  name: string;
  total: number;
  pct: number;
  axes: AgentReadinessAxis[];
  gaps: string[];
}
