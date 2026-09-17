/**
 * Browser-safe workflow canvas surface.
 * Do not import store / structure-change / evaluate here — they use node:fs.
 */
export {
  workflowDocumentSchema,
  workflowEdgeSchema,
  workflowNodeSchema,
  workflowNodeTypeSchema,
  workflowKindSchema,
  workflowIdSchema,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowKind,
  type WorkflowEdgeKind,
  type WorkflowNodePayload,
} from "../../../schemas/workflow-canvas.js";

export {
  DEFAULT_WORKFLOW_META,
  annotateDependencies,
  asWorkflowNodeType,
  documentToFlow,
  exportToJSON,
  parseWorkflowDocument,
  readFlowNodeData,
  stringifyWorkflowDocument,
} from "./serialize.js";

export {
  documentToMermaid,
  documentToTable,
  formatWorkflowTableText,
  type WorkflowTableEdgeRow,
  type WorkflowTableNodeRow,
  type WorkflowTableProjection,
} from "./projections.js";

export { BUSINESS_WORKFLOW_SAMPLE, SYSTEM_MAP_SAMPLE } from "./sample.js";

export type {
  FlowEdgeData,
  FlowEdgeLike,
  FlowNodeData,
  FlowNodeLike,
  WorkflowDocumentMeta,
} from "./types.js";
export { WORKFLOW_NODE_TYPES } from "./types.js";
