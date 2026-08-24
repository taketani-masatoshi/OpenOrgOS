import type { Handoff, HandoffStatus } from "../../../schemas/routing.js";
import { loadHandoff, loadHandoffChildren } from "../routing.js";
import {
  getWorkOrderDispatch,
  transitionWorkOrder,
  WORK_ORDER_CANCEL_BLOCK_REASON,
} from "./work-order-state.js";

export interface PlanGraph {
  rootId: string;
  nodes: Map<string, Handoff>;
  waves: string[][];
}

export function resolvePlanRoot(id: string): string {
  const handoff = loadHandoff(id);
  if (handoff.child_ids?.length) return handoff.id;
  if (handoff.parent_id) return handoff.parent_id;
  return handoff.id;
}

export function collectPlanNodes(rootId: string): Handoff[] {
  const root = loadHandoff(rootId);
  if (root.child_ids?.length) {
    return [root, ...loadHandoffChildren(root)];
  }
  return [root];
}

function validateDependencies(nodes: Map<string, Handoff>): void {
  for (const node of nodes.values()) {
    for (const depId of node.depends_on) {
      if (!nodes.has(depId)) {
        throw new Error(`${node.id}: depends_on references unknown work order ${depId}`);
      }
    }
  }
}

function detectCycle(nodes: Map<string, Handoff>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string, trail: string[]): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = trail.indexOf(id);
      const cycle = [...trail.slice(cycleStart), id].join(" -> ");
      throw new Error(`Cycle detected: ${cycle}`);
    }
    visiting.add(id);
    const node = nodes.get(id);
    if (!node) return;
    for (const depId of node.depends_on) {
      visit(depId, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of nodes.keys()) {
    visit(id, []);
  }
}

export function computeWaves(nodes: Map<string, Handoff>): string[][] {
  const ids = [...nodes.values()]
    .filter((node) => !(node.child_ids?.length))
    .map((node) => node.id);
  const depth = new Map<string, number>();

  function nodeDepth(id: string, stack: Set<string>): number {
    const cached = depth.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) {
      throw new Error(`Cycle detected at ${id}`);
    }
    stack.add(id);
    const node = nodes.get(id);
    const deps = node?.depends_on ?? [];
    const value =
      deps.length === 0 ? 0 : Math.max(...deps.map((depId) => nodeDepth(depId, stack))) + 1;
    stack.delete(id);
    depth.set(id, value);
    return value;
  }

  for (const id of ids) {
    nodeDepth(id, new Set());
  }

  const maxDepth = Math.max(0, ...depth.values());
  const waves: string[][] = [];
  for (let wave = 0; wave <= maxDepth; wave += 1) {
    const layer = ids
      .filter((id) => depth.get(id) === wave)
      .sort((a, b) => a.localeCompare(b));
    if (layer.length) waves.push(layer);
  }
  return waves;
}

export function buildPlanGraph(rootId: string): PlanGraph {
  const nodeList = collectPlanNodes(rootId);
  const nodes = new Map(nodeList.map((node) => [node.id, node]));
  validateDependencies(nodes);
  detectCycle(nodes);
  return {
    rootId,
    nodes,
    waves: computeWaves(nodes),
  };
}

function dependencyStatuses(graph: PlanGraph, node: Handoff): HandoffStatus[] {
  return node.depends_on.map((depId) => graph.nodes.get(depId)?.status ?? "pending");
}

export function dependenciesCompleted(graph: PlanGraph, node: Handoff): boolean {
  if (!node.depends_on.length) return true;
  return node.depends_on.every((depId) => graph.nodes.get(depId)?.status === "completed");
}

export function dependenciesFailed(graph: PlanGraph, node: Handoff): boolean {
  return node.depends_on.some((depId) => graph.nodes.get(depId)?.status === "failed");
}

export function readyWorkOrders(graph: PlanGraph): Handoff[] {
  return [...graph.nodes.values()]
    .filter(
      (node) =>
        node.status === "pending" &&
        node.task_type === "implement" &&
        !(node.child_ids?.length) &&
        dependenciesCompleted(graph, node) &&
        !dependenciesFailed(graph, node),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function retryableFailedWorkOrders(graph: PlanGraph): Handoff[] {
  return [...graph.nodes.values()].filter((node) => {
    if (node.status !== "failed" || node.task_type !== "implement") return false;
    const dispatch = node.dispatch;
    const attempts = dispatch?.attempts ?? 0;
    const maxAttempts = dispatch?.max_attempts ?? 2;
    return attempts < maxAttempts;
  });
}

export function blockedByFailure(graph: PlanGraph): Handoff[] {
  const failedIds = new Set(
    [...graph.nodes.values()].filter((node) => node.status === "failed").map((node) => node.id),
  );
  if (!failedIds.size) return [];

  const blocked = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes.values()) {
      if (blocked.has(node.id)) continue;
      const blockedDep = node.depends_on.some((depId) => failedIds.has(depId) || blocked.has(depId));
      if (blockedDep) {
        blocked.add(node.id);
        changed = true;
      }
    }
  }

  return [...graph.nodes.values()]
    .filter((node) => blocked.has(node.id) && node.status !== "completed" && node.status !== "blocked")
    .sort((a, b) => a.id.localeCompare(b.id));
}

function isCancelledBlock(node: Handoff): boolean {
  const dispatch = getWorkOrderDispatch(node);
  return dispatch.last_error === WORK_ORDER_CANCEL_BLOCK_REASON;
}

export function syncParentPlanStatus(graph: PlanGraph): Handoff | undefined {
  const root = graph.nodes.get(graph.rootId) ?? loadHandoff(graph.rootId);
  if (!root.child_ids?.length || root.status === "completed") return undefined;

  const children = root.child_ids
    .map((id) => graph.nodes.get(id) ?? loadHandoff(id))
    .filter((node) => node.task_type === "implement" && !(node.child_ids?.length));

  if (children.length === 0) return undefined;
  if (!children.every((child) => child.status === "completed")) return undefined;

  const next = transitionWorkOrder(root.id, "completed", {
    completionNotes: `all ${children.length} child work order(s) completed`,
    skipQueueEvent: true,
  });
  graph.nodes.set(root.id, next);
  return next;
}

export function syncDependencyStatuses(graph: PlanGraph): Handoff[] {
  const updated: Handoff[] = [];

  for (const node of graph.nodes.values()) {
    if (node.task_type !== "implement") continue;

    if (dependenciesFailed(graph, node) && !["failed", "completed", "blocked"].includes(node.status)) {
      const next = transitionWorkOrder(node.id, "blocked", {
        error: "upstream dependency failed",
        skipQueueEvent: true,
      });
      graph.nodes.set(node.id, next);
      updated.push(next);
      continue;
    }

    if (
      node.status === "blocked" &&
      node.depends_on.length > 0 &&
      !isCancelledBlock(node) &&
      dependenciesCompleted(graph, node) &&
      !dependenciesFailed(graph, node)
    ) {
      const next = transitionWorkOrder(node.id, "pending", { skipQueueEvent: true });
      graph.nodes.set(node.id, next);
      updated.push(next);
      continue;
    }

    if (
      node.depends_on.length > 0 &&
      !dependenciesCompleted(graph, node) &&
      node.status === "pending"
    ) {
      const next = transitionWorkOrder(node.id, "waiting", { skipQueueEvent: true });
      graph.nodes.set(node.id, next);
      updated.push(next);
      continue;
    }

    if (
      node.depends_on.length > 0 &&
      dependenciesCompleted(graph, node) &&
      node.status === "waiting"
    ) {
      const next = transitionWorkOrder(node.id, "pending", { skipQueueEvent: true });
      graph.nodes.set(node.id, next);
      updated.push(next);
    }
  }

  const parent = syncParentPlanStatus(graph);
  if (parent) updated.push(parent);

  return updated;
}

export function parseDependsSpec(specs: string[]): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const spec of specs) {
    const trimmed = spec.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid --depends spec "${spec}" (expected CHILD:PARENT)`);
    }
    const [child, parent] = parts;
    const existing = edges.get(child) ?? [];
    if (!existing.includes(parent)) existing.push(parent);
    edges.set(child, existing);
  }
  return edges;
}
