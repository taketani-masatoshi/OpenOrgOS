import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData } from "@orgos/workflow-canvas";

type WorkflowFlowNode<T extends string> = Node<FlowNodeData, T>;

const TYPE_LABEL: Record<string, string> = {
  aia_agent: "AIA",
  business_task: "Task",
  system_module: "Module",
};

function NodeShell({
  type,
  data,
  selected,
}: {
  type: string;
  data: FlowNodeData;
  selected: boolean;
}) {
  const badge = TYPE_LABEL[type] ?? type;
  return (
    <article
      className={`wf-node wf-node--${type}${selected ? " is-selected" : ""}`}
      aria-label={`${badge}: ${data.label}`}
    >
      <Handle type="target" position={Position.Left} className="wf-handle" />
      <p className="wf-node-kicker">{badge}</p>
      <h3 className="wf-node-title">{data.label}</h3>
      {data.description ? <p className="wf-node-desc">{data.description}</p> : null}
      {data.role || data.status ? (
        <p className="wf-node-meta">
          {data.role ? data.role : null}
          {data.role && data.status ? " · " : null}
          {data.status ? data.status : null}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} className="wf-handle" />
    </article>
  );
}

export function AiaAgentNode({ data, selected }: NodeProps<WorkflowFlowNode<"aia_agent">>) {
  return <NodeShell type="aia_agent" data={data} selected={selected} />;
}

export function BusinessTaskNode({
  data,
  selected,
}: NodeProps<WorkflowFlowNode<"business_task">>) {
  return <NodeShell type="business_task" data={data} selected={selected} />;
}

export function SystemModuleNode({
  data,
  selected,
}: NodeProps<WorkflowFlowNode<"system_module">>) {
  return <NodeShell type="system_module" data={data} selected={selected} />;
}

export const workflowNodeTypes = {
  aia_agent: AiaAgentNode,
  business_task: BusinessTaskNode,
  system_module: SystemModuleNode,
};
