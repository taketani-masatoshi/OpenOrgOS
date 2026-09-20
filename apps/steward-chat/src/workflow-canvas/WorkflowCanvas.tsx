import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import {
  documentToFlow,
  exportToJSON,
  parseWorkflowDocument,
  stringifyWorkflowDocument,
  SYSTEM_MAP_SAMPLE,
  type FlowNodeData,
  type WorkflowDocument,
  type WorkflowDocumentMeta,
} from "@orgos/workflow-canvas";
import { workflowNodeTypes } from "./nodes";

import "@xyflow/react/dist/style.css";
import "./workflow-canvas.css";

export type WorkflowCanvasHandle = {
  exportToJSON: () => WorkflowDocument;
  importFromJSON: (input: unknown) => WorkflowDocument;
  toJSONString: () => string;
};

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<{ kind?: string }>;

type Props = {
  initialDocument?: WorkflowDocument;
  onDocumentChange?: (document: WorkflowDocument) => void;
  className?: string;
};

const MINIMAP_COLOR: Record<string, string> = {
  aia_agent: "#004a94",
  business_task: "#18794e",
  system_module: "#1d1d1f",
};

function metaOf(document: WorkflowDocument): WorkflowDocumentMeta {
  return {
    version: document.version,
    workflow_id: document.workflow_id,
    kind: document.kind,
    title: document.title,
    ...(document.description ? { description: document.description } : {}),
  };
}

function WorkflowCanvasInner(
  { initialDocument = SYSTEM_MAP_SAMPLE, onDocumentChange, className }: Props,
  ref: Ref<WorkflowCanvasHandle>,
) {
  const seed = useMemo(() => documentToFlow(initialDocument), [initialDocument]);
  const [nodes, setNodes, onNodesChange] = useNodesState(seed.nodes as FlowNode[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seed.edges as FlowEdge[]);
  const metaRef = useRef<WorkflowDocumentMeta>(metaOf(initialDocument));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const emit = useCallback(
    (nextNodes = nodesRef.current, nextEdges = edgesRef.current) => {
      const document = exportToJSON(nextNodes, nextEdges, metaRef.current);
      onDocumentChange?.(document);
      return document;
    },
    [onDocumentChange],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge(
          { ...connection, type: "smoothstep", data: { kind: "handoff" } },
          current,
        );
        queueMicrotask(() => emit(nodesRef.current, next));
        return next;
      });
    },
    [emit, setEdges],
  );

  useImperativeHandle(
    ref,
    () => ({
      exportToJSON: () => exportToJSON(nodesRef.current, edgesRef.current, metaRef.current),
      importFromJSON: (input: unknown) => {
        const document = parseWorkflowDocument(input);
        metaRef.current = metaOf(document);
        const flow = documentToFlow(document);
        setNodes(flow.nodes as FlowNode[]);
        setEdges(flow.edges as FlowEdge[]);
        onDocumentChange?.(document);
        return document;
      },
      toJSONString: () =>
        stringifyWorkflowDocument(
          exportToJSON(nodesRef.current, edgesRef.current, metaRef.current),
        ),
    }),
    [onDocumentChange, setEdges, setNodes],
  );

  const rootClass = className ? `workflow-canvas ${className}` : "workflow-canvas";

  return (
    <div className={rootClass}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={(_event, _node, nextNodes) => {
          emit(nextNodes, edgesRef.current);
        }}
        onDelete={() => queueMicrotask(() => emit())}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(29,29,31,0.16)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => MINIMAP_COLOR[node.type ?? ""] ?? "#48484a"}
          maskColor="rgba(245, 245, 247, 0.72)"
        />
      </ReactFlow>
    </div>
  );
}

const WorkflowCanvasForward = forwardRef(WorkflowCanvasInner);

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, Props>(
  function WorkflowCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <WorkflowCanvasForward {...props} ref={ref} />
      </ReactFlowProvider>
    );
  },
);
