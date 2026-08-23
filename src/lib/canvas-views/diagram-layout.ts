/**
 * Deterministic tree layout for Canvas View Model `diagram` sections.
 * Positions are baked into the View Model so Cursor and Web share the same geometry.
 */

export type DiagramTone = "neutral" | "info" | "success" | "warning" | "danger";

export type DiagramLogicalNode = {
  id: string;
  label: string;
  sublabel?: string;
  tone?: DiagramTone;
  kind?: "root" | "branch" | "leaf" | "detached";
};

export type DiagramLogicalEdge = {
  from: string;
  to: string;
  style?: "solid" | "dashed";
};

export type DiagramLaidOutNode = DiagramLogicalNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagramLaidOutEdge = {
  from: string;
  to: string;
  source_x: number;
  source_y: number;
  target_x: number;
  target_y: number;
  /** Orthogonal polyline (H/V only). Includes source and target endpoints. */
  points: Array<{ x: number; y: number }>;
  style?: "solid" | "dashed";
};

export type DiagramLayoutResult = {
  width: number;
  height: number;
  nodes: DiagramLaidOutNode[];
  edges: DiagramLaidOutEdge[];
};

export interface LayoutDiagramOptions {
  nodes: DiagramLogicalNode[];
  edges: DiagramLogicalEdge[];
  nodeWidth?: number;
  nodeHeight?: number;
  rankGap?: number;
  nodeGap?: number;
  padding?: number;
}

/** Build orthogonal (axis-aligned) elbow path from parent bottom to child top. */
export function orthogonalEdgePoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): Array<{ x: number; y: number }> {
  const sx = Math.round(sourceX);
  const sy = Math.round(sourceY);
  const tx = Math.round(targetX);
  const ty = Math.round(targetY);
  if (sx === tx) {
    return [
      { x: sx, y: sy },
      { x: tx, y: ty },
    ];
  }
  const midY = Math.round((sy + ty) / 2);
  return [
    { x: sx, y: sy },
    { x: sx, y: midY },
    { x: tx, y: midY },
    { x: tx, y: ty },
  ];
}

/**
 * Top-down tree layout. Multiple roots are placed as siblings under a virtual row.
 * Cycles / unknown endpoints are ignored for ranking (edges still laid if both ends exist).
 */
export function layoutDiagram(opts: LayoutDiagramOptions): DiagramLayoutResult {
  const nodeWidth = opts.nodeWidth ?? 168;
  const nodeHeight = opts.nodeHeight ?? 56;
  const rankGap = opts.rankGap ?? 48;
  const nodeGap = opts.nodeGap ?? 28;
  const padding = opts.padding ?? 24;

  const byId = new Map(opts.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of opts.nodes) {
    children.set(n.id, []);
    indegree.set(n.id, 0);
  }
  for (const e of opts.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    children.get(e.from)!.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }

  const roots = opts.nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  /** subtree width in px for each node */
  const subtreeWidth = new Map<string, number>();
  const visit = new Set<string>();

  function measure(id: string): number {
    if (subtreeWidth.has(id)) return subtreeWidth.get(id)!;
    if (visit.has(id)) {
      subtreeWidth.set(id, nodeWidth);
      return nodeWidth;
    }
    visit.add(id);
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      subtreeWidth.set(id, nodeWidth);
      return nodeWidth;
    }
    let total = 0;
    for (let i = 0; i < kids.length; i++) {
      total += measure(kids[i]!);
      if (i < kids.length - 1) total += nodeGap;
    }
    const w = Math.max(nodeWidth, total);
    subtreeWidth.set(id, w);
    return w;
  }

  for (const r of roots) measure(r);

  const pos = new Map<string, { x: number; y: number }>();

  function place(id: string, depth: number, left: number): void {
    const w = subtreeWidth.get(id) ?? nodeWidth;
    const kids = children.get(id) ?? [];
    const x = left + (w - nodeWidth) / 2;
    const y = padding + depth * (nodeHeight + rankGap);
    pos.set(id, { x, y });
    if (kids.length === 0) return;
    let cursor = left + (w - measureSpan(kids)) / 2;
    for (const kid of kids) {
      const kw = subtreeWidth.get(kid) ?? nodeWidth;
      place(kid, depth + 1, cursor);
      cursor += kw + nodeGap;
    }
  }

  function measureSpan(kids: string[]): number {
    let total = 0;
    for (let i = 0; i < kids.length; i++) {
      total += subtreeWidth.get(kids[i]!) ?? nodeWidth;
      if (i < kids.length - 1) total += nodeGap;
    }
    return total;
  }

  let rootCursor = padding;
  let forestWidth = 0;
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i]!;
    const rw = subtreeWidth.get(r) ?? nodeWidth;
    place(r, 0, rootCursor);
    rootCursor += rw + nodeGap;
    forestWidth += rw + (i < roots.length - 1 ? nodeGap : 0);
  }

  // Place any unreached nodes (orphans) in a bottom row
  const maxDepth = Math.max(
    0,
    ...[...pos.values()].map((p) =>
      Math.round((p.y - padding) / (nodeHeight + rankGap))
    )
  );
  let orphanLeft = padding;
  for (const n of opts.nodes) {
    if (pos.has(n.id)) continue;
    const y = padding + (maxDepth + 1) * (nodeHeight + rankGap);
    pos.set(n.id, { x: orphanLeft, y });
    orphanLeft += nodeWidth + nodeGap;
  }

  const nodes: DiagramLaidOutNode[] = opts.nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: padding, y: padding };
    return {
      ...n,
      x: Math.round(p.x),
      y: Math.round(p.y),
      width: nodeWidth,
      height: nodeHeight,
    };
  });

  const nodeBox = new Map(nodes.map((n) => [n.id, n]));
  const edges: DiagramLaidOutEdge[] = [];
  for (const e of opts.edges) {
    const a = nodeBox.get(e.from);
    const b = nodeBox.get(e.to);
    if (!a || !b) continue;
    const source_x = Math.round(a.x + a.width / 2);
    const source_y = Math.round(a.y + a.height);
    const target_x = Math.round(b.x + b.width / 2);
    const target_y = Math.round(b.y);
    edges.push({
      from: e.from,
      to: e.to,
      source_x,
      source_y,
      target_x,
      target_y,
      points: orthogonalEdgePoints(source_x, source_y, target_x, target_y),
      style: e.style ?? "solid",
    });
  }

  let maxX = padding;
  let maxY = padding;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }

  return {
    width: Math.max(padding * 2 + forestWidth, maxX + padding),
    height: maxY + padding,
    nodes,
    edges,
  };
}
