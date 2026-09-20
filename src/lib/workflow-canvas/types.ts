import type {
  WorkflowDocument,
  WorkflowEdgeKind,
  WorkflowNodePayload,
  WorkflowNodeType,
} from "../../../schemas/workflow-canvas.js";

/** React Flow node snapshot — no selected / measured / dragging fields. */
export type FlowNodeLike = {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data?: unknown;
};

/** React Flow edge snapshot — label must be a string to survive export. */
export type FlowEdgeLike = {
  id: string;
  source: string;
  target: string;
  label?: unknown;
  data?: unknown;
};

export type WorkflowDocumentMeta = Pick<
  WorkflowDocument,
  "version" | "workflow_id" | "kind" | "title" | "description"
>;

export type FlowNodeData = WorkflowNodePayload & {
  label: string;
  description?: string;
};

export type FlowEdgeData = {
  kind?: WorkflowEdgeKind;
};

export const WORKFLOW_NODE_TYPES: readonly WorkflowNodeType[] = [
  "aia_agent",
  "business_task",
  "system_module",
];
