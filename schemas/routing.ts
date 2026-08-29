import { z } from "zod";
import { agentId } from "./classification.js";
import { dateString } from "./common.js";
import { workKindSchema } from "./dispatch-tower.js";

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
  profiles: z.array(z.enum(["operational", "developer"])).default(["operational"]),
});

export const routingRegistrySchema = z.object({
  version: z.string(),
  as_of: z.string().optional(),
  routes: z.array(routeDefinitionSchema).min(1),
});

export type RouteBoundary = z.output<typeof routeBoundarySchema>;
export type RouteMatch = z.output<typeof routeMatchSchema>;
export type RouteDefinition = z.output<typeof routeDefinitionSchema>;
export type RoutingRegistry = z.output<typeof routingRegistrySchema>;

export const taskTypeSchema = z.enum(["consult", "implement"]);
export const handoffPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const handoffModeSchema = z.enum(["suggest", "auto", "implement"]);
export const handoffExecutionDecisionSchema = z.enum([
  "direct_skill",
  "work_order",
  "human_approval",
]);
export const handoffInvocationStatusSchema = z.enum([
  "planned",
  "running",
  "succeeded",
  "failed",
  "deferred",
  "work_order",
  "human_approval",
]);

export const handoffStatusSchema = z.enum([
  "pending",
  "waiting",
  "dispatched",
  "running",
  "completed",
  "failed",
  "blocked",
]);

export const workOrderDispatchSchema = z.object({
  attempts: z.number().int().nonnegative().default(0),
  max_attempts: z.number().int().positive().default(2),
  last_run_id: z.string().optional(),
  last_error: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  trace_id: z.string().optional(),
});

export const handoffInvocationSchema = z.object({
  decision: handoffExecutionDecisionSchema,
  status: handoffInvocationStatusSchema,
  skill_id: z.string().optional(),
  execution: z.enum(["handler", "argv", "agent", "deferred", "unwired"]).optional(),
  argv: z.array(z.string()).optional(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  required_arguments: z.array(z.string()).default([]),
  missing_arguments: z.array(z.string()).default([]),
  attempts: z.number().int().nonnegative().default(0),
  result: z.string().optional(),
  failure_reason: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});

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
  status: handoffStatusSchema,
  notes: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
  dispatch: workOrderDispatchSchema.optional(),
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
  invocation: handoffInvocationSchema.optional(),
  /** Dispatch Tower — work classification and human assignee (ADR 0057). */
  work_kind: workKindSchema.optional(),
  assignee_employee_id: z.string().optional(),
  assignee_operator_id: z.string().optional(),
  due_date: dateString.optional(),
  blocked_on: z.string().optional(),
});

export type HandoffStatus = z.output<typeof handoffStatusSchema>;
export type WorkOrderDispatch = z.output<typeof workOrderDispatchSchema>;
export type TaskType = z.output<typeof taskTypeSchema>;
export type HandoffMode = z.output<typeof handoffModeSchema>;
export type HandoffInvocation = z.output<typeof handoffInvocationSchema>;
export type Handoff = z.output<typeof handoffSchema>;

export interface EscalationInput {
  subject?: string;
  background?: string;
  requirements?: string;
  deliverables?: string[];
  acceptance_criteria?: string[];
  text?: string;
  path?: string;
  priority?: z.output<typeof handoffPrioritySchema>;
  tenant?: string;
}

export interface WorkOrderPlan {
  input: EscalationInput;
  matches: Array<{
    routeId: string;
    agent: z.output<typeof agentId>;
    skill?: string;
    score: number;
    eligible: boolean;
  }>;
  agents: z.output<typeof agentId>[];
  multiAgent: boolean;
}
