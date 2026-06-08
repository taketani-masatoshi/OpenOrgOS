import { z } from "zod";
import { agentId } from "./classification.js";

export const routeBoundarySchema = z.enum(["default", "executive_data", "executive_summaries"]);

export const routeMatchSchema = z.object({
  keywords: z.array(z.string()).default([]),
  paths: z.array(z.string()).default([]),
  intents: z.array(z.string()).default([]),
});

export const routeDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  agent: agentId,
  skill: z.string().optional(),
  match: routeMatchSchema,
  resource_paths: z.array(z.string()).default([]),
  priority: z.number().int().default(0),
  boundary: routeBoundarySchema.default("default"),
  module_agent: z.boolean().default(false),
});

export const routingRegistrySchema = z.object({
  version: z.string(),
  as_of: z.string().optional(),
  routes: z.array(routeDefinitionSchema).min(1),
});

export type RouteBoundary = z.infer<typeof routeBoundarySchema>;
export type RouteMatch = z.infer<typeof routeMatchSchema>;
export type RouteDefinition = z.infer<typeof routeDefinitionSchema>;
export type RoutingRegistry = z.infer<typeof routingRegistrySchema>;

export const taskTypeSchema = z.enum(["consult", "implement"]);
export const handoffPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const handoffModeSchema = z.enum(["suggest", "auto", "implement"]);

export const handoffSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  from_agent: z.string(),
  to_agent: agentId,
  skill: z.string().optional(),
  route_id: z.string().optional(),
  mode: handoffModeSchema.default("suggest"),
  task_type: taskTypeSchema.default("consult"),
  access: z.object({
    allowed: z.boolean(),
    reason: z.string(),
  }),
  context: z.object({
    text: z.string().optional(),
    path: z.string().optional(),
  }),
  status: z.enum(["pending", "dispatched", "completed", "blocked"]),
  notes: z.string().optional(),
  /** implement work order fields */
  subject: z.string().optional(),
  background: z.string().optional(),
  requirements: z.string().optional(),
  deliverables: z.array(z.string()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  parent_id: z.string().optional(),
  child_ids: z.array(z.string()).optional(),
  agent_prompt_path: z.string().optional(),
  priority: handoffPrioritySchema.optional(),
  tenant: z.string().optional(),
  completion_notes: z.string().optional(),
});

export type TaskType = z.infer<typeof taskTypeSchema>;
export type HandoffMode = z.infer<typeof handoffModeSchema>;
export type Handoff = z.infer<typeof handoffSchema>;

export interface EscalationInput {
  subject?: string;
  background?: string;
  requirements?: string;
  deliverables?: string[];
  acceptance_criteria?: string[];
  text?: string;
  path?: string;
  priority?: z.infer<typeof handoffPrioritySchema>;
  tenant?: string;
}

export interface WorkOrderPlan {
  input: EscalationInput;
  matches: Array<{
    routeId: string;
    agent: z.infer<typeof agentId>;
    skill?: string;
    score: number;
    eligible: boolean;
  }>;
  agents: z.infer<typeof agentId>[];
  multiAgent: boolean;
}
