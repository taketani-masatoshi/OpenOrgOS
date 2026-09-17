import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { KIND_JA, type NodeKind, type NodeStatus } from "./graph";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  subtitle: string;
  kind: NodeKind;
  status: NodeStatus;
  detail: string;
}

export type FlowNode = Node<FlowNodeData, "module">;

export function ModuleNode({ data, sourcePosition, targetPosition }: NodeProps<FlowNode>) {
  const muted = data.status === "off" || data.status === "extract" || data.status === "excluded" || data.status === "generated";
  return (
    <div
      className={`flow-node kind-${data.kind}${muted ? " is-muted" : ""}`}
      role="img"
      aria-label={`${data.label} ${data.subtitle}`}
    >
      <Handle type="target" position={targetPosition ?? Position.Left} />
      <div className="flow-node-kind">{KIND_JA[data.kind]}</div>
      <div className="flow-node-label">{data.label}</div>
      <div className="flow-node-sub">{data.subtitle}</div>
      <Handle type="source" position={sourcePosition ?? Position.Right} />
    </div>
  );
}
