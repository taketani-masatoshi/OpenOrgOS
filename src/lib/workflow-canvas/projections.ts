/**
 * Read-only projections of WorkflowDocument.
 * Table / Mermaid / Flow are display surfaces — never a second SSOT.
 */
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowEdgeKind,
  WorkflowNode,
  WorkflowNodeType,
} from "../../../schemas/workflow-canvas.js";

export type WorkflowTableNodeRow = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  description?: string;
  agent_id?: string;
  module_id?: string;
  role?: string;
  status?: string;
  sources: string[];
  targets: string[];
};

export type WorkflowTableEdgeRow = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: WorkflowEdgeKind;
};

export type WorkflowTableProjection = {
  nodes: WorkflowTableNodeRow[];
  edges: WorkflowTableEdgeRow[];
};

function nodeToTableRow(node: WorkflowNode): WorkflowTableNodeRow {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    ...(node.description ? { description: node.description } : {}),
    ...(node.data?.agent_id ? { agent_id: node.data.agent_id } : {}),
    ...(node.data?.module_id ? { module_id: node.data.module_id } : {}),
    ...(node.data?.role ? { role: node.data.role } : {}),
    ...(node.data?.status ? { status: node.data.status } : {}),
    sources: [...node.sources],
    targets: [...node.targets],
  };
}

function edgeToTableRow(edge: WorkflowEdge): WorkflowTableEdgeRow {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.kind ? { kind: edge.kind } : {}),
  };
}

/** Stable table projection (id ascending). Omits position (layout hint only). */
export function documentToTable(document: WorkflowDocument): WorkflowTableProjection {
  const nodes = [...document.nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(nodeToTableRow);
  const edges = [...document.edges]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(edgeToTableRow);
  return { nodes, edges };
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/\n/g, " ");
}

function mermaidNodeDecl(node: WorkflowNode): string {
  const label = escapeMermaidLabel(node.label);
  switch (node.type) {
    case "aia_agent":
      return `${node.id}(["${label}"])`;
    case "system_module":
      return `${node.id}[["${label}"]]`;
    case "business_task":
    default:
      return `${node.id}["${label}"]`;
  }
}

function mermaidEdgeLine(edge: WorkflowEdge): string {
  const parts: string[] = [];
  if (edge.kind) parts.push(edge.kind);
  if (edge.label) parts.push(escapeMermaidLabel(edge.label));
  if (parts.length === 0) {
    return `${edge.source} --> ${edge.target}`;
  }
  return `${edge.source} -->|"${parts.join(": ")}"| ${edge.target}`;
}

/** Mermaid flowchart source for PR / chat / Cursor transcript (not interactive). */
export function documentToMermaid(document: WorkflowDocument): string {
  const nodes = [...document.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...document.edges].sort((a, b) => a.id.localeCompare(b.id));
  const lines: string[] = [
    "flowchart LR",
    `%% ${document.workflow_id} · ${escapeMermaidLabel(document.title)}`,
  ];
  for (const node of nodes) {
    lines.push(mermaidNodeDecl(node));
  }
  for (const edge of edges) {
    lines.push(mermaidEdgeLine(edge));
  }
  return `${lines.join("\n")}\n`;
}

export function formatWorkflowTableText(document: WorkflowDocument): string {
  const { nodes, edges } = documentToTable(document);
  const nodeLines = [
    "nodes:",
    "id\ttype\tlabel\tsources\ttargets",
    ...nodes.map(
      (n) =>
        `${n.id}\t${n.type}\t${n.label}\t${n.sources.join(",")}\t${n.targets.join(",")}`,
    ),
  ];
  const edgeLines = [
    "edges:",
    "id\tsource\ttarget\tkind\tlabel",
    ...edges.map(
      (e) => `${e.id}\t${e.source}\t${e.target}\t${e.kind ?? ""}\t${e.label ?? ""}`,
    ),
  ];
  return `${nodeLines.join("\n")}\n\n${edgeLines.join("\n")}\n`;
}
