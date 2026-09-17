import { z } from "zod";

/**
 * AI-facing workflow / system-map graph.
 * React Flow internals stay out of this document — only id, type, label,
 * position, and source/target dependencies.
 */

export const workflowDocumentVersion = z.literal(1);

export const workflowKindSchema = z.enum(["system_map", "business_workflow"]);

export const workflowNodeTypeSchema = z.enum([
  "aia_agent",
  "business_task",
  "system_module",
]);

export const workflowNodeStatusSchema = z.enum([
  "idle",
  "active",
  "blocked",
  "done",
]);

export const workflowEdgeKindSchema = z.enum([
  "handoff",
  "invoke",
  "data",
  "approval",
]);

export const workflowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const workflowNodePayloadSchema = z.object({
  agent_id: z.string().min(1).optional(),
  module_id: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  status: workflowNodeStatusSchema.optional(),
});

export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  type: workflowNodeTypeSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  position: workflowPositionSchema,
  /** Incoming node ids (dependencies this node reads). */
  sources: z.array(z.string().min(1)),
  /** Outgoing node ids (dependents this node feeds). */
  targets: z.array(z.string().min(1)),
  data: workflowNodePayloadSchema.optional(),
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: workflowEdgeKindSchema.optional(),
});

export const workflowIdSchema = z
  .string()
  .min(1)
  .regex(/^WF-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const workflowDocumentSchema = z.object({
  version: workflowDocumentVersion,
  workflow_id: workflowIdSchema,
  kind: workflowKindSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowKind = z.output<typeof workflowKindSchema>;
export type WorkflowNodeType = z.output<typeof workflowNodeTypeSchema>;
export type WorkflowNodeStatus = z.output<typeof workflowNodeStatusSchema>;
export type WorkflowEdgeKind = z.output<typeof workflowEdgeKindSchema>;
export type WorkflowNodePayload = z.output<typeof workflowNodePayloadSchema>;
export type WorkflowNode = z.output<typeof workflowNodeSchema>;
export type WorkflowEdge = z.output<typeof workflowEdgeSchema>;
export type WorkflowDocument = z.output<typeof workflowDocumentSchema>;
