import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  EDGE_KIND_JA,
  KIND_JA,
  VIEW_LABEL,
  graphFor,
  layoutGraph,
  type EdgeKind,
  type ViewId,
} from "./graph";
import { ModuleNode, type FlowNodeData } from "./ModuleNode";

const VIEWS: ViewId[] = ["modules", "workspace", "runtime", "agents"];

const nodeTypes = { module: ModuleNode } satisfies NodeTypes;

function dashedStatus(status: FlowNodeData["status"]): boolean {
  return status === "off" || status === "extract" || status === "excluded" || status === "generated";
}

function buildElements(view: ViewId, showDisabled: boolean): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const laid = layoutGraph(graphFor(view, showDisabled));
  const sourcePosition = laid.direction === "LR" ? Position.Right : Position.Bottom;
  const targetPosition = laid.direction === "LR" ? Position.Left : Position.Top;
  const nodeById = new Map(laid.nodes.map((item) => [item.id, item]));

  const nodes: Node<FlowNodeData>[] = laid.nodes.map((item) => ({
    id: item.id,
    type: "module",
    position: { x: item.x, y: item.y },
    sourcePosition,
    targetPosition,
    data: {
      label: item.label,
      subtitle: item.subtitle,
      kind: item.kind,
      status: item.status,
      detail: item.detail,
    },
  }));

  const edges: Edge[] = laid.edges.map((item) => {
    const target = nodeById.get(item.to);
    const dashed = item.kind === "mirror" || (target ? dashedStatus(target.status) : false);
    return {
      id: `${item.from}->${item.to}:${item.kind}`,
      source: item.from,
      target: item.to,
      label: item.label,
      data: { kind: item.kind },
      animated: item.kind === "handoff" || item.kind === "auth",
      style: dashed ? { strokeDasharray: "6 4" } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    };
  });

  return { nodes, edges };
}

export function App() {
  const [view, setView] = useState<ViewId>("modules");
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("module:hospitality");

  const { nodes, edges } = useMemo(() => buildElements(view, showDisabled), [view, showDisabled]);
  const selected = nodes.find((item) => item.id === selectedId) ?? null;
  const connected = selected
    ? edges.filter((item) => item.source === selected.id || item.target === selected.id)
    : [];

  const onNodeClick = useCallback<NodeMouseHandler<Node<FlowNodeData>>>((_event, node) => {
    setSelectedId(node.id);
  }, []);

  return (
    <div className={selected ? "app-shell has-detail" : "app-shell"}>
      <header className="app-bar">
        <div>
          <h1>OOO モジュール接続</h1>
          <p>React Flow 表示専用 · MAL 名簿の静的スナップショット</p>
        </div>
        <nav className="view-tabs" aria-label="表示切替">
          {VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              className={view === id ? "is-active" : undefined}
              onClick={() => {
                setView(id);
                setSelectedId(null);
              }}
            >
              {VIEW_LABEL[id]}
            </button>
          ))}
          {view === "modules" ? (
            <button
              type="button"
              className={showDisabled ? "is-active" : undefined}
              onClick={() => setShowDisabled((value) => !value)}
            >
              名簿オフも表示
            </button>
          ) : null}
        </nav>
      </header>

      <main className="app-main">
        <ReactFlow
          key={`${view}-${showDisabled ? "all" : "on"}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.2}
          maxZoom={1.6}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background gap={18} />
          <Controls />
          <MiniMap
            pannable
            zoomable
            nodeColor={() => "#4a5160"}
            maskColor="rgba(16,17,20,0.55)"
          />
        </ReactFlow>
      </main>

      {selected ? (
        <aside className="detail-panel" aria-label="選択ノード">
          <p className="detail-kind">
            {KIND_JA[selected.data.kind]} · {selected.data.status}
          </p>
          <h2>{selected.data.label}</h2>
          <p className="detail-id">{selected.id}</p>
          <p>{selected.data.detail}</p>
          {connected.length > 0 ? (
            <ul>
              {connected.map((item) => {
                const outgoing = item.source === selected.id;
                const otherId = outgoing ? item.target : item.source;
                const other = nodes.find((node) => node.id === otherId);
                const kind = (item.data?.kind as EdgeKind | undefined) ?? "uses";
                return (
                  <li key={item.id}>
                    <span>{outgoing ? "→" : "←"}</span> {EDGE_KIND_JA[kind]} · {other?.data.label ?? otherId}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
