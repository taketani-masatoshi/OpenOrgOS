import {
  workflowDocumentSchema,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowEdgeKind,
  type WorkflowNode,
  type WorkflowNodeType,
} from "../../../schemas/workflow-canvas.js";
import type {
  FlowEdgeLike,
  FlowNodeData,
  FlowNodeLike,
  WorkflowDocumentMeta,
} from "./types.js";
import { WORKFLOW_NODE_TYPES } from "./types.js";

const NODE_TYPE_SET = new Set<string>(WORKFLOW_NODE_TYPES);

export const DEFAULT_WORKFLOW_META: WorkflowDocumentMeta = {
  version: 1,
  workflow_id: "WF-untitled",
  kind: "system_map",
  title: "Untitled workflow",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asWorkflowNodeType(type: string | null | undefined): WorkflowNodeType {
  if (type && NODE_TYPE_SET.has(type)) return type as WorkflowNodeType;
  return "business_task";
}

function asEdgeKind(value: unknown): WorkflowEdgeKind | undefined {
  if (value === "handoff" || value === "invoke" || value === "data" || value === "approval") {
    return value;
  }
  return undefined;
}

export function readFlowNodeData(data: unknown, fallbackLabel: string): FlowNodeData {
  if (!isRecord(data)) return { label: fallbackLabel };
  const label = readString(data.label) ?? fallbackLabel;
  const description = readString(data.description);
  const agentId = readString(data.agent_id);
  const moduleId = readString(data.module_id);
  const role = readString(data.role);
  const status = data.status;
  return {
    label,
    ...(description ? { description } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(moduleId ? { module_id: moduleId } : {}),
    ...(role ? { role } : {}),
    ...(status === "idle" || status === "active" || status === "blocked" || status === "done"
      ? { status }
      : {}),
  };
}

function edgeLabelOf(edge: FlowEdgeLike): string | undefined {
  return readString(edge.label);
}

function edgeKindOf(edge: FlowEdgeLike): WorkflowEdgeKind | undefined {
  if (!isRecord(edge.data)) return undefined;
  return asEdgeKind(edge.data.kind);
}

export function annotateDependencies(
  nodes: Omit<WorkflowNode, "sources" | "targets">[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  const sources = new Map<string, string[]>();
  const targets = new Map<string, string[]>();
  for (const edge of edges) {
    const incoming = sources.get(edge.target) ?? [];
    incoming.push(edge.source);
    sources.set(edge.target, incoming);
    const outgoing = targets.get(edge.source) ?? [];
    outgoing.push(edge.target);
    targets.set(edge.source, outgoing);
  }
  return nodes.map((node) => ({
    ...node,
    sources: [...new Set(sources.get(node.id) ?? [])].sort(),
    targets: [...new Set(targets.get(node.id) ?? [])].sort(),
  }));
}

export function exportToJSON(
  nodes: FlowNodeLike[],
  edges: FlowEdgeLike[],
  meta: WorkflowDocumentMeta = DEFAULT_WORKFLOW_META,
): WorkflowDocument {
  const documentEdges: WorkflowEdge[] = edges
    .map((edge) => {
      const label = edgeLabelOf(edge);
      const kind = edgeKindOf(edge);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(label ? { label } : {}),
        ...(kind ? { kind } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const bareNodes = nodes
    .map((node) => {
      const payload = readFlowNodeData(node.data, node.id);
      const { label, description, ...data } = payload;
      const extra =
        data.agent_id || data.module_id || data.role || data.status ? data : undefined;
      return {
        id: node.id,
        type: asWorkflowNodeType(node.type),
        label,
        ...(description ? { description } : {}),
        position: { x: node.position.x, y: node.position.y },
        ...(extra ? { data: extra } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return workflowDocumentSchema.parse({
    version: 1,
    workflow_id: meta.workflow_id,
    kind: meta.kind,
    title: meta.title,
    ...(meta.description ? { description: meta.description } : {}),
    nodes: annotateDependencies(bareNodes, documentEdges),
    edges: documentEdges,
  });
}

export function parseWorkflowDocument(input: unknown): WorkflowDocument {
  return workflowDocumentSchema.parse(input);
}

export function documentToFlow(document: WorkflowDocument): {
  nodes: FlowNodeLike[];
  edges: FlowEdgeLike[];
} {
  return {
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: {
        label: node.label,
        ...(node.description ? { description: node.description } : {}),
        ...(node.data ?? {}),
      } satisfies FlowNodeData,
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.kind ? { data: { kind: edge.kind } } : {}),
    })),
  };
}

export function stringifyWorkflowDocument(document: WorkflowDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
